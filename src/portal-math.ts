import * as THREE from 'three';

const flip = new THREE.Matrix4().makeRotationY(Math.PI);

export function portalCameraMatrix(source: THREE.Matrix4, destination: THREE.Matrix4, camera: THREE.Matrix4): THREE.Matrix4 {
  return destination.clone().multiply(flip).multiply(source.clone().invert()).multiply(camera);
}

export function destinationClipPlane(destination: THREE.Matrix4): THREE.Plane {
  const normal = new THREE.Vector3(0, 0, 1).transformDirection(destination);
  const point = new THREE.Vector3().setFromMatrixPosition(destination).addScaledVector(normal, 0.06);
  return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point);
}
