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
  { id: 'brique-rouge', label: 'Brique rouge', src: '/wall/brique-rouge.jpg' },
  { id: 'vieux-mur-briques', label: 'Vieux mur de briques', src: '/wall/vieux-mur-briques.jpg' },
  { id: 'brique-plancher', label: 'Brique et plancher', src: '/wall/brique-plancher.jpg' },
  { id: 'brique-noire', label: 'Brique noire', src: '/wall/brique-noire.jpg' },
  { id: 'brique-noire-vieillie', label: 'Brique noire vieillie', src: '/wall/brique-noire-vieillie.jpg' },
  { id: 'moellon', label: 'Moellon', src: '/wall/moellon.jpg' },
  { id: 'pierre-eclairee', label: 'Pierre éclairée', src: '/wall/pierre-eclairee.jpg' },
  { id: 'ardoise-plancher', label: 'Pierre ardoise et plancher', src: '/wall/ardoise-plancher.jpg' },
];

export function getWallBackground(id: string): WallBackground {
  return WALL_BACKGROUNDS.find((b) => b.id === id) ?? WALL_BACKGROUNDS[0];
}
