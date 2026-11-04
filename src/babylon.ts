// The slice of Babylon the game uses. Importing from "@babylonjs/core" directly pulls in all of it (about 5 MB),
// so every file imports from here instead. Side-effect imports register features the classes below rely on.

import "@babylonjs/core/Culling/ray"; // scene.pick
import "@babylonjs/core/Meshes/instancedMesh"; // mesh.createInstance
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import "@babylonjs/core/Particles/particleSystemComponent";
import "@babylonjs/core/Layers/effectLayerSceneComponent";
import "@babylonjs/core/Meshes/thinInstanceMesh"; // mesh.thinInstanceSetBuffer
import "@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent";

export { Engine } from "@babylonjs/core/Engines/engine";
export { Scene } from "@babylonjs/core/scene";
export { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
export { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
export { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
export { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
export { Mesh } from "@babylonjs/core/Meshes/mesh";
export { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
export { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
export { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
export { TransformNode } from "@babylonjs/core/Meshes/transformNode";
export { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
export { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
export { ColorCurves } from "@babylonjs/core/Materials/colorCurves";
export { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
export { Texture } from "@babylonjs/core/Materials/Textures/texture";
export { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
export { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
export { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
export { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
export { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
export { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
export { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
export { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
