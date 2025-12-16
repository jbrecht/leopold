const canvas = document.getElementById('fireworksCanvas');
const ctx = canvas.getContext('2d');
const startOverlay = document.getElementById('startOverlay');

let width = window.innerWidth;
let height = window.innerHeight;
canvas.width = width;
canvas.height = height;

let photos = [];
let loadedImages = [];
let fireworks = [];
let particles = [];
let isRunning = false;
let audioCtx;
let noiseBuffer;

// Configuration
const GRAVITY = 0.04; // Reduced gravity to make them float longer
const FRICTION = 0.99;
const PARTICLES_PER_EXPLOSION = 40; // Fewer particles since they are images
const PARTICLE_SIZE = 120; // Size of the photo particles

// Resize handler
window.addEventListener('resize', () => {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
});

// Start handler
startOverlay.addEventListener('click', () => {
    if (!isRunning) {
        startOverlay.classList.add('hidden');
        isRunning = true;
        
        // Initialize Audio Context on user gesture
        initAudio();
        
        loadPhotos().then(() => {
            animate();
        });
    }
});

function initAudio() {
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        // Create 2 seconds of white noise buffer
        const bufferSize = audioCtx.sampleRate * 2; 
        noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
    } catch (e) {
        console.warn('Web Audio API not supported', e);
    }
}

function playExplosionSound() {
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    const source = audioCtx.createBufferSource();
    source.buffer = noiseBuffer;

    // Filter to make it sound like a "thud" (low pass)
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, audioCtx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.5);

    const gainNode = audioCtx.createGain();
    
    // Envelope: sharp attack, decay
    gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime); 
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.8);

    source.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    source.start();
    source.stop(audioCtx.currentTime + 1);
}

function playBigExplosionSound() {
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    const source = audioCtx.createBufferSource();
    source.buffer = noiseBuffer;

    // Filter for deep BOOM (low pass starting lower)
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, audioCtx.currentTime); // Start lower (400Hz vs 800Hz)
    filter.frequency.exponentialRampToValueAtTime(10, audioCtx.currentTime + 1.5); // Drop to rumble

    const gainNode = audioCtx.createGain();
    
    // Envelope: Louder attack, longer decay
    gainNode.gain.setValueAtTime(0.8, audioCtx.currentTime); 
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.5);

    source.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    source.start();
    source.stop(audioCtx.currentTime + 2);
}

// Fetch and load photos
async function loadPhotos() {
    try {
        const response = await fetch('photos.json');
        const filenames = await response.json();
        
        const loadPromises = filenames.map(filename => {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.src = 'photos/' + filename;
                img.onload = () => resolve(img);
                img.onerror = () => {
                    console.warn(`Failed to load image: ${filename}`);
                    resolve(null); // Resolve with null to handle gracefully
                };
            });
        });

        const images = await Promise.all(loadPromises);
        loadedImages = images.filter(img => img !== null);
        console.log(`Loaded ${loadedImages.length} images`);
    } catch (err) {
        console.error('Error fetching photos:', err);
    }
}

class Firework {
    constructor() {
        this.x = Math.random() * width;
        this.y = height;
        this.sx = Math.random() * 3 - 1.5;
        this.sy = -(Math.random() * 4 + 10); // Launch velocity
        this.size = 2;
        this.hue = Math.random() * 360;
        this.exploded = false;
        
        // Target height to explode at
        this.targetY = Math.random() * (height * 0.4) + (height * 0.1); 
    }

    update() {
        this.x += this.sx;
        this.y += this.sy;
        this.sy += GRAVITY;

        // Draw rocket trail
        ctx.fillStyle = `hsl(${this.hue}, 100%, 50%)`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();

        // Check if should explode
        if (this.sy >= 0 || this.y <= this.targetY) {
            this.explode();
            return false; // Remove firework
        }
        return true; // Keep firework
    }

    explode() {
        playExplosionSound();
        for (let i = 0; i < PARTICLES_PER_EXPLOSION; i++) {
            particles.push(new Particle(this.x, this.y, this.hue));
        }
    }
}

class BigFirework {
    constructor() {
        this.x = Math.random() * width;
        this.y = height;
        this.sx = Math.random() * 2 - 1; // Slower horizontal movement
        this.sy = -(Math.random() * 2 + 12); // Higher launch velocity
        this.size = 5; // Initial size
        this.hue = Math.random() * 360;
        this.exploded = false;
        
        // Target height to explode at (higher up)
        this.targetY = Math.random() * (height * 0.2) + (height * 0.1); 
        
        // Assign a random photo
        this.image = loadedImages.length > 0 
            ? loadedImages[Math.floor(Math.random() * loadedImages.length)] 
            : null;
    }

    update() {
        this.x += this.sx;
        this.y += this.sy;
        this.sy += GRAVITY;

        // Grow in size as it rises
        this.size += 1.5;

        // Draw the main image
        if (this.image) {
             const aspect = this.image.width / this.image.height;
            let drawWidth = this.size * 4; // Make it big!
            let drawHeight = this.size * 4;
            
            if (aspect > 1) {
                drawHeight = drawWidth / aspect;
            } else {
                drawWidth = drawHeight * aspect;
            }

            ctx.save();
            ctx.translate(this.x, this.y);
            // Spin slowly?
            // ctx.rotate(this.size * 0.05);
            ctx.drawImage(this.image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
            
            // Add a glow based on hue
            ctx.globalCompositeOperation = 'overlay';
            ctx.fillStyle = `hsla(${this.hue}, 100%, 50%, 0.3)`;
            ctx.beginPath();
            ctx.arc(0, 0, Math.max(drawWidth, drawHeight)/1.5, 0, Math.PI*2);
            ctx.fill();
            
            ctx.restore();
        } else {
            // Fallback
             ctx.fillStyle = `hsl(${this.hue}, 100%, 50%)`;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        }

        // Check if should explode
        if (this.sy >= 0 || this.y <= this.targetY) {
            this.explode();
            return false; // Remove firework
        }
        return true; // Keep firework
    }

    explode() {
        playBigExplosionSound();
        // BIG Explosion!
        const particleCount = PARTICLES_PER_EXPLOSION * 10;
        for (let i = 0; i < particleCount; i++) {
            particles.push(new GlitterParticle(this.x, this.y));
        }
    }
}

class GlitterParticle {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 8 + 2;
        this.sx = 1.5 * Math.cos(angle) * speed;
        this.sy = 1.5 * Math.sin(angle) * speed;
        this.alpha = 1;
        this.decay = Math.random() * 0.001 + 0.005;
        this.hue = 50; // Gold/Yellow
    }

    update() {
        this.x += this.sx;
        this.y += this.sy;
        this.sx *= FRICTION;
        this.sy *= FRICTION;
        this.sy += GRAVITY;
        this.alpha -= this.decay;

        if (this.alpha > 0) {
            ctx.save();
            // Strobe effect: Rapidly switch between very bright and dark
            // 50% chance of being very bright white/gold, 50% chance of being dark/invisible
            const isBright = Math.random() > 0.5;
            const lightness = isBright ? 100 : 5; 
            const strobeAlpha = this.alpha * (isBright ? 1 : 0.3); // Dark phase is also more transparent
            
            ctx.fillStyle = `hsla(${this.hue}, 100%, ${lightness}%, ${strobeAlpha})`;
            ctx.beginPath();
            ctx.arc(this.x, this.y, Math.random() * 2 + 1, 0, Math.PI * 2); 
            ctx.fill();
            ctx.restore();
        }

        return this.alpha > 0;
    }
}

class Particle {
    constructor(x, y, hue) {
        this.x = x;
        this.y = y;
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 6 + 2; // Increased explosion speed
        this.sx = Math.cos(angle) * speed;
        this.sy = Math.sin(angle) * speed;
        this.alpha = 1;
        this.decay = Math.random() * 0.015 + 0.005;
        this.hue = hue;
        
        // Assign a random photo if available
        this.image = loadedImages.length > 0 
            ? loadedImages[Math.floor(Math.random() * loadedImages.length)] 
            : null;
    }

    update() {
        this.x += this.sx;
        this.y += this.sy;
        this.sx *= FRICTION;
        this.sy *= FRICTION;
        this.sy += GRAVITY;
        this.alpha -= this.decay;

        if (this.image) {
            // Constrain aspect ratio
            const aspect = this.image.width / this.image.height;
            let drawWidth = PARTICLE_SIZE;
            let drawHeight = PARTICLE_SIZE;
            
            if (aspect > 1) {
                drawHeight = PARTICLE_SIZE / aspect;
            } else {
                drawWidth = PARTICLE_SIZE * aspect;
            }

            ctx.save();
            ctx.globalAlpha = this.alpha;
            ctx.translate(this.x, this.y);
            // Spin effect? Maybe too much. Let's keep them upright for visibility.
            ctx.drawImage(this.image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
            
            // Add a glow/tint based on firework color
            ctx.globalCompositeOperation = 'overlay';
            ctx.fillStyle = `hsla(${this.hue}, 100%, 50%, 0.5)`;
            ctx.beginPath();
            ctx.arc(0, 0, Math.max(drawWidth, drawHeight)/2, 0, Math.PI*2);
            ctx.fill();
            
            ctx.restore();
        } else {
            // Fallback points if no images
            ctx.fillStyle = `hsla(${this.hue}, 100%, 50%, ${this.alpha})`;
            ctx.beginPath();
            ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
            ctx.fill();
        }

        return this.alpha > 0;
    }
}

function animate() {
    // Semi-transparent clear for trails
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(0, 0, width, height);

    // Randomly clean up excessive trails if performance drops (optional optimization)
    // For now, simple clear is fine.

    // Launch random fireworks
    if (Math.random() < 0.03) {
        if (Math.random() < 0.2) {
             fireworks.push(new BigFirework());
        } else {
             fireworks.push(new Firework());
        }
    }

    // Update fireworks
    fireworks = fireworks.filter(fw => fw.update());

    // Update particles
    particles = particles.filter(p => p.update());

    if (isRunning) {
        requestAnimationFrame(animate);
    }
}
