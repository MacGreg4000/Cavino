/**
 * Fonds de la vue Mur : photos rangées dans /public/wall.
 * Pour en ajouter un : déposer l'image dans app/public/wall/ et l'ajouter ici.
 */

export interface WallBackground {
  id: string;
  label: string;
  src: string;
}

export const WALL_BACKGROUNDS: WallBackground[] = [
  { id: 'pierre-eclairee', label: 'Pierre éclairée et plancher', src: '/wall/pierre-eclairee.jpg' },
  { id: 'moellon', label: 'Moellon', src: '/wall/moellon.jpg' },
];

export function getWallBackground(id: string): WallBackground {
  return WALL_BACKGROUNDS.find((b) => b.id === id) ?? WALL_BACKGROUNDS[0];
}
