/*
  CATÁLOGO DE DIÁMETROS DE TUBERÍA
  Diseño: Arley Zarate
  Fecha: 14/10/2026

  Este archivo es la fuente de datos del catálogo mostrado dentro de
  banco_ductos_v15.html.

  Para AGREGAR un diámetro: copie una línea y cambie sus dos valores.
  Para ELIMINAR un diámetro: elimine la línea correspondiente.
  Use punto decimal. Ejemplo: 60.325
  Si aún no conoce el diámetro exterior, use null.

  IMPORTANTE: mantenga este archivo en la misma carpeta que el HTML.
*/
window.DIAMETROS_TUBERIA = [
  { pulgadas: "3/4",   exterior_mm: 26.67 },
  { pulgadas: "1",     exterior_mm: 33.401 },
  { pulgadas: "1 1/2", exterior_mm: 48.26 },
  { pulgadas: "2",     exterior_mm: 60.325 },
  { pulgadas: "2 1/2", exterior_mm: 73.025 },
  { pulgadas: "3",     exterior_mm: 88.9 },
  { pulgadas: "4",     exterior_mm: 114.3 },
  { pulgadas: "6",     exterior_mm: 168.275 },
  { pulgadas: "8",     exterior_mm: null },
  { pulgadas: "10",    exterior_mm: null }
];
