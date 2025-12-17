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
let cycleStartTime = 0;
let skyFlashAlpha = 0;
let skyFlashHue = 0;

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
        cycleStartTime = performance.now();
        
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

    const t = audioCtx.currentTime;

    // 1. Main Big BOOM
    const source = audioCtx.createBufferSource();
    source.buffer = noiseBuffer;

    // Filter for deep BOOM (low pass starting lower)
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, t); // Start lower (400Hz vs 800Hz)
    filter.frequency.exponentialRampToValueAtTime(10, t + 1.5); // Drop to rumble

    const gainNode = audioCtx.createGain();
    
    // Envelope: Louder attack, longer decay
    gainNode.gain.setValueAtTime(0.8, t); 
    gainNode.gain.exponentialRampToValueAtTime(0.001, t + 1.5);

    source.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    source.start(t);
    source.stop(t + 2);

    // 2. Washed out Whoosh (Aftermath)
    const wSource = audioCtx.createBufferSource();
    wSource.buffer = noiseBuffer;
    
    // Bandpass for "windy" feel, sweeping down
    const wFilter = audioCtx.createBiquadFilter();
    wFilter.type = 'bandpass';
    wFilter.Q.value = 1; // Wider band for "washed out" feel
    wFilter.frequency.setValueAtTime(1000, t);
    wFilter.frequency.exponentialRampToValueAtTime(100, t + 2.5); // Sweep down

    const wGain = audioCtx.createGain();
    wGain.gain.setValueAtTime(0, t);
    wGain.gain.linearRampToValueAtTime(0.2, t + 0.2); // Fade in
    wGain.gain.exponentialRampToValueAtTime(0.001, t + 2.5); // Long fade out

    wSource.connect(wFilter);
    wFilter.connect(wGain);
    wGain.connect(audioCtx.destination);
    
    wSource.start(t);
    wSource.stop(t + 3);
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
        
        // Assign a random photo for this firework's particles
        this.image = loadedImages.length > 0 
            ? loadedImages[Math.floor(Math.random() * loadedImages.length)] 
            : null; 
    }

    update() {
        this.x += this.sx;
        this.y += this.sy;
        this.sy += GRAVITY;

        // Draw rocket trail
        ctx.fillStyle = 'orange';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();

        // Draw small image at tip
        if (this.image) {
            const tipSize = 20;
            const aspect = this.image.width / this.image.height;
            let w = tipSize;
            let h = tipSize;
            
            if (aspect > 1) {
                h = w / aspect;
            } else {
                w = h * aspect;
            }
            
            ctx.drawImage(this.image, this.x - w / 2, this.y - h / 2, w, h);
        }

        // Check if should explode
        if (this.sy >= 0 || this.y <= this.targetY) {
            this.explode();
            return false; // Remove firework
        }
        return true; // Keep firework
    }

    explode() {
        playExplosionSound();
        skyFlashHue = this.hue;
        skyFlashAlpha = 0.2;
        for (let i = 0; i < PARTICLES_PER_EXPLOSION; i++) {
            particles.push(new Particle(this.x, this.y, this.hue, this.image));
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
        skyFlashHue = this.hue;
        skyFlashAlpha = 0.2; // Brighter flash for big fireworks
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
    constructor(x, y, hue, image) {
        this.x = x;
        this.y = y;
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 6 + 2; // Increased explosion speed
        this.sx = Math.cos(angle) * speed;
        this.sy = Math.sin(angle) * speed;
        this.alpha = 1;
        this.decay = Math.random() * 0.015 + 0.005;
        this.hue = hue;
        
        // Rotation
        this.angle = 0;
        this.rotationSpeed = Math.random() * 0.2 - 0.1; // Random spin speed

        // Use the image assigned to the parent firework
        this.image = image;
    }

    update() {
        this.x += this.sx;
        this.y += this.sy;
        this.sx *= FRICTION;
        this.sy *= FRICTION;
        this.sy += GRAVITY;
        this.alpha -= this.decay;
        
        // Prevent negative alpha causing crash in arc() radius
        if (this.alpha <= 0) return false;
        
        // Update rotation
        this.angle += this.rotationSpeed;

        if (this.image) {
            // Constrain aspect ratio
            const aspect = this.image.width / this.image.height;
            // Shrink as it decays
            const currentSize = PARTICLE_SIZE * this.alpha;
            let drawWidth = currentSize;
            let drawHeight = currentSize;
            
            if (aspect > 1) {
                drawHeight = currentSize / aspect;
            } else {
                drawWidth = currentSize * aspect;
            }

            ctx.save();
            ctx.globalAlpha = this.alpha;
            ctx.translate(this.x, this.y);
            ctx.rotate(this.angle); // Apply rotation
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

    // Sky Flash Effect
    if (skyFlashAlpha > 0) {
        ctx.fillStyle = `hsla(${skyFlashHue}, 100%, 50%, ${skyFlashAlpha})`;
        // Use 'lighter' composite operation for a better light flash effect
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = 'source-over'; // Reset
        
        skyFlashAlpha -= 0.2; // Fades out in ~50 frames (~0.8s) if starts at 1, or fast if starts low
        if (skyFlashAlpha < 0) skyFlashAlpha = 0;
    }

    // Randomly clean up excessive trails if performance drops (optional optimization)
    // For now, simple clear is fine.

    // Launch random fireworks
    // Cycle: 20 seconds total
    // 0-10s: Warmup (infrequent)
    // 10-30: Main phase 
    // 30-40s: Crescendo (ramp up to very frequent)
    // 40-50s: Grand finale
    // 50-60s: Pause (0 spawn)

    const totalDuration = 60000;
    const warmupDuration = 10000;
    const mainPhaseDuration = 20000;
    const crescendoDuration = 10000;
    const finaleDuration = 10000;
    const pauseDuration = 10000;
    
    const now = performance.now();
    const timeInCycle = (now - cycleStartTime) % totalDuration;
    let spawnProbability = 0;

    if (timeInCycle < warmupDuration) {
        // Phase 1: Steady, somewhat infrequent
        spawnProbability = 0.01;
    } else if (timeInCycle < warmupDuration + mainPhaseDuration) {
        // Phase 2: More frequent, ramping up
        const progress = (timeInCycle - warmupDuration) / mainPhaseDuration;
        spawnProbability = 0.01 + (progress * 0.09);
    } else if (timeInCycle < warmupDuration + mainPhaseDuration + crescendoDuration) {
        // Phase 3: crescendo
        const progress = (timeInCycle - (warmupDuration + mainPhaseDuration)) / crescendoDuration;
        spawnProbability = 0.02 + (progress * 0.09); 
    } else if (timeInCycle < warmupDuration + mainPhaseDuration + crescendoDuration + finaleDuration) {
        // Phase 4: Grand finale
        const progress = (timeInCycle - (warmupDuration + mainPhaseDuration + crescendoDuration)) / finaleDuration;
        spawnProbability = 0.05 + (progress * 0.09); 
    } else {
        // Phase 5: Silence
        spawnProbability = 0.005;
    }

    if (Math.random() < spawnProbability) {
        if (timeInCycle / totalDuration > 0.7 && Math.random() < 0.2) {
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
