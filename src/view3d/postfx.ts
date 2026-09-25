/**
 * BLOOM — post-traitement
 *
 * L'ambiance de la maquette tient à une seule idée : certaines couleurs sont
 * « plus que blanches » (composante > 1 grâce à `hdr`) et le bloom les fait
 * déborder en halo. Sans OutputPass après UnrealBloomPass, le rendu ressort
 * trop sombre : c'est lui qui réapplique le tone mapping et l'espace
 * colorimétrique du renderer, perdus en sortie du composer.
 */

import type { Camera, Scene, WebGLRenderer } from 'three';
import { Color, Vector2 } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

/** Couleur « plus que blanche » : déclenche le bloom au lieu de simplement éclairer. */
export function hdr(hex: number, k: number): Color {
  return new Color(hex).multiplyScalar(k);
}

export interface ReglagesBloom {
  force?: number;
  rayon?: number;
  seuil?: number;
}

const DEFAUTS: Required<ReglagesBloom> = { force: 0.75, rayon: 0.55, seuil: 0.82 };

export class PostFx {
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;

  constructor(renderer: WebGLRenderer, scene: Scene, camera: Camera, reglages: ReglagesBloom = {}) {
    const { force, rayon, seuil } = { ...DEFAUTS, ...reglages };

    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    this.bloom = new UnrealBloomPass(new Vector2(1, 1), force, rayon, seuil);
    this.composer.addPass(this.bloom);

    this.composer.addPass(new OutputPass());
  }

  setSize(largeur: number, hauteur: number): void {
    this.composer.setSize(largeur, hauteur);
  }

  render(): void {
    this.composer.render();
  }

  dispose(): void {
    this.composer.dispose();
  }
}
