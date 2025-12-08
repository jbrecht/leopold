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
        loadPhotos().then(() => {
            animate();
        });
    }
});

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
        for (let i = 0; i < PARTICLES_PER_EXPLOSION; i++) {
            particles.push(new Particle(this.x, this.y, this.hue));
        }
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
        fireworks.push(new Firework());
    }

    // Update fireworks
    fireworks = fireworks.filter(fw => fw.update());

    // Update particles
    particles = particles.filter(p => p.update());

    if (isRunning) {
        requestAnimationFrame(animate);
    }
}
