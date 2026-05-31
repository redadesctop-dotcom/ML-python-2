# 3D Physics Engine
======================

A comprehensive, open-source 3D physics engine designed to simulate realistic rigid body dynamics, collision detection, and particle systems. This engine provides an interactive control system, allowing developers to create immersive and engaging experiences.

## Features
------------

* **Rigid Body Dynamics**: Simulate complex rigid body motion, including translation, rotation, and collision response.
* **Collision Detection**: Advanced collision detection system, supporting various shapes and primitives, including spheres, boxes, and meshes.
* **Particle System**: Create realistic particle effects, such as explosions, fire, water, and more.
* **Interactive Controls**: Intuitive control system, allowing users to manipulate objects and simulate physics in real-time.

## Requirements
---------------

* **Operating System**: Windows, macOS, or Linux
* **Compiler**: C++11 or later (e.g., GCC, Clang, or Visual Studio)
* **Dependencies**:
	+ GLM (OpenGL Mathematics)
	+ SDL (Simple DirectMedia Layer)
	+ OpenGL 3.3 or later

## Build and Installation
------------------------

1. Clone the repository: `git clone https://github.com/your-username/3d-physics-engine.git`
2. Navigate to the project directory: `cd 3d-physics-engine`
3. Build the engine: `make` (or `make debug` for a debug build)
4. Install the engine: `make install`

## Usage
-----

### Initialization

To initialize the engine, create an instance of the `PhysicsEngine` class:
```cpp
#include "physics_engine.h"

int main() {
    PhysicsEngine engine;
    engine.init();
    // ...
}
```
### Rigid Body Creation

Create a rigid body by specifying its mass, position, and velocity:
```cpp
RigidBody body;
body.mass = 1.0f;
body.position = glm::vec3(0.0f, 0.0f, 0.0f);
body.velocity = glm::vec3(1.0f, 0.0f, 0.0f);
engine.addRigidBody(body);
```
### Collision Detection

Enable collision detection for a rigid body:
```cpp
body.collisionEnabled = true;
engine.addCollisionShape(body, CollisionShape::SPHERE);
```
### Particle System

Create a particle system:
```cpp
ParticleEmitter emitter;
emitter.position = glm::vec3(0.0f, 0.0f, 0.0f);
emitter.velocity = glm::vec3(1.0f, 0.0f, 0.0f);
engine.addParticleEmitter(emitter);
```
### Interactive Controls

Use the following functions to manipulate objects and simulate physics in real-time:
```cpp
engine.stepSimulation(1.0f / 60.0f);
engine.applyForce(body, glm::vec3(0.0f, 1.0f, 0.0f));
engine.applyTorque(body, glm::vec3(0.0f, 1.0f, 0.0f));
```
## API Documentation
--------------------

For a detailed description of the engine's API, please refer to the [API documentation](docs/api.md).

## Contributing
------------

We welcome contributions to the 3D physics engine. Please submit a pull request with a detailed description of your changes.

## License
-------

This project is licensed under the [MIT License](LICENSE.md).

## Acknowledgments
--------------

* Special thanks to [Your Name] for contributing to the development of this engine.
* Thanks to the [GLM](https://glm.g-truc.net/) and [SDL](https://www.libsdl.org/) libraries for providing essential functionality.