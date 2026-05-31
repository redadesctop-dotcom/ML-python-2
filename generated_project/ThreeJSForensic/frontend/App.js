**3D Physics Engine App.js**
```jsx
import React, { useState, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { Physics } from 'cannon-es';
import Particles from './Particles';

const App = () => {
  const [scene, setScene] = useState(null);
  const [camera, setCamera] = useState(null);
  const [renderer, setRenderer] = useState(null);
  const [physicsWorld, setPhysicsWorld] = useState(null);
  const [rigidBodies, setRigidBodies] = useState([]);
  const [particles, setParticles] = useState([]);

  useEffect(() => {
    // Initialize scene, camera, and renderer
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({
      canvas: document.getElementById('canvas'),
      antialias: true,
    });

    // Set up physics world
    const physicsWorld = new Physics.World({
      gravity: new Physics.Vec3(0, -9.82, 0),
    });

    // Initialize rigid bodies
    const rigidBody1 = new Physics.Body({
      mass: 1,
      position: new Physics.Vec3(0, 5, 0),
      shape: new Physics.Sphere(1),
    });
    const rigidBody2 = new Physics.Body({
      mass: 1,
      position: new Physics.Vec3(5, 5, 0),
      shape: new Physics.Sphere(1),
    });
    physicsWorld.addBody(rigidBody1);
    physicsWorld.addBody(rigidBody2);

    // Initialize particles
    const particleSystem = new Particles();
    const particleCount = 100;
    for (let i = 0; i < particleCount; i++) {
      const particle = particleSystem.createParticle();
      particle.position.copy(new Physics.Vec3(Math.random() * 10, Math.random() * 10, Math.random() * 10));
      particle.velocity.copy(new Physics.Vec3(Math.random() * 2, Math.random() * 2, Math.random() * 2));
      particles.push(particle);
    }

    // Add interactive controls
    const orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.target = new THREE.Vector3(0, 0, 0);

    // Update state
    setScene(scene);
    setCamera(camera);
    setRenderer(renderer);
    setPhysicsWorld(physicsWorld);
    setRigidBodies([rigidBody1, rigidBody2]);
    setParticles(particles);

    // Animate
    const animate = () => {
      requestAnimationFrame(animate);
      physicsWorld.step(1 / 60);
      particles.forEach((particle) => {
        particle.update();
      });
      renderer.render(scene, camera);
    };
    animate();
  }, []);

  useEffect(() => {
    // Update renderer size
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [camera, renderer]);

  return (
    <div>
      <canvas id="canvas" />
      {scene && (
        <div>
          <h1>3D Physics Engine</h1>
          <button onClick={() => {
            const newRigidBody = new Physics.Body({
              mass: 1,
              position: new Physics.Vec3(Math.random() * 10, Math.random() * 10, Math.random() * 10),
              shape: new Physics.Sphere(1),
            });
            physicsWorld.addBody(newRigidBody);
            setRigidBodies([...rigidBodies, newRigidBody]);
          }}>
            Add Rigid Body
          </button>
          <button onClick={() => {
            particles.push(particleSystem.createParticle());
            setParticles(particles);
          }}>
            Add Particle
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
```

**Particles.js**
```jsx
import * as THREE from 'three';
import { Physics } from 'cannon-es';

class Particle {
  constructor() {
    this.position = new Physics.Vec3();
    this.velocity = new Physics.Vec3();
    this.geometry = new THREE.SphereGeometry(0.1, 32, 32);
    this.material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
  }

  update() {
    this.position.add(this.velocity);
    this.mesh.position.copy(this.position);
  }
}

class Particles {
  createParticle() {
    return new Particle();
  }
}

export default Particles;
```

**index.html**
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>3D Physics Engine</title>
  <style>
    body {
      margin: 0;
      background-color: #f0f0f0;
    }
    #canvas {
      width: 100%;
      height: 100vh;
      display: block;
    }
  </style>
</head>
<body>
  <canvas id="canvas"></canvas>
  <script src="index.js"></script>
</body>
</html>
```

This code sets up a basic 3D physics engine with rigid bodies, collision, and a particle system. The scene is rendered using Three.js, and the physics is handled using Cannon-es. The app includes interactive controls using OrbitControls, and the user can add new rigid bodies and particles to the scene.

Please note that this is a basic example, and you will likely need to add more features and functionality to create a fully-fledged 3D physics engine. Additionally, you may need to modify the code to fit your specific use case.

**Installation**

To run this code, you will need to install the following dependencies:

* `three`: `npm install three`
* `cannon-es`: `npm install cannon-es`
* `react`: `npm install react`
* `react-dom`: `npm install react-dom`

**Run**

To run the app, use the following command:

`npm start`

This will start the development server, and you can access the app in your web browser at `http://localhost:3000`.