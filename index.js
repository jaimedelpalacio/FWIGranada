// index.js
// Microservicio FWI Granada - Bounding box simple y filtrado desde "Moderado" (FWI >= 11)

const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const gdal = require('gdal-async');

const app = express();
const PORT = process.env.PORT || 3000;

// Bounding box aproximado de Granada
const GRANADA_BBOX = { 
  west: -4.41, 
  east: -2.50, 
  south: 36.70, 
  north: 38.00 
};

const UMBRAL_MODERADO = 11;

// Verifica si un punto está dentro del bounding box de Granada
function inGranada(lon, lat) {
  return (
    lon >= GRANADA_BBOX.west && lon <= GRANADA_BBOX.east &&
    lat >= GRANADA_BBOX.south && lat <= GRANADA_BBOX.north
  );
}

app.get('/fwi/granada', async (req, res) => {
  try {
    // Fecha actual en formato YYYYMMDD
    const today = new Date().toISOString().slice(0,10).replace(/-/g,'');
    // URL del raster FWI EFFIS/Copernicus para la fecha actual
    const FWI_URL = `https://effis-gwf.jrc.ec.europa.eu/download/effis/fwi/EFFIS_FWI_Europe_${today}.tif`;
    const RASTER_PATH = path.join(__dirname, `fwi_${today}.tif`);

    // Descargar raster si no existe localmente
    if (!fs.existsSync(RASTER_PATH)) {
      const response = await axios({ url: FWI_URL, method: 'GET', responseType: 'stream' });
      const writer = fs.createWriteStream(RASTER_PATH);
      await new Promise((resolve, reject) => {
        response.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
      });
    }

    // Abrir raster y preparar transformación
    const ds = gdal.open(RASTER_PATH);
    const band = ds.bands.get(1);
    const geoTransform = ds.geoTransform;

    const fwiPoints = [];
    for (let px = 0; px < ds.rasterSize.x; px++) {
      for (let py = 0; py < ds.rasterSize.y; py++) {
        // Convertir píxel a coordenadas lon/lat
        const lon = geoTransform[0] + px * geoTransform[1] + py * geoTransform[2];
        const lat = geoTransform[3] + px * geoTransform[4] + py * geoTransform[5];
        // Filtrar por bounding box de Granada
        if (!inGranada(lon, lat)) continue;
        // Leer valor FWI
        const fwi = band.pixels.get(px, py);
        if (fwi >= UMBRAL_MODERADO) {
          let nivel = '';
          if (fwi < 21) nivel = 'Moderado';
          else if (fwi < 33) nivel = 'Alto';
          else if (fwi < 50) nivel = 'Muy alto';
          else nivel = 'Extremo';
          fwiPoints.push({ lon, lat, fwi, nivel });
        }
      }
    }

    res.json({ 
      fecha: today, 
      provincia: 'Granada', 
      total: fwiPoints.length, 
      puntos: fwiPoints 
    });

  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

app.get('/', (req, res) => {
  res.send('Servicio FWI Granada - Usa /fwi/granada para resultados');
});

app.listen(PORT, () => {
  console.log(`Servicio escuchando en puerto ${PORT}`);
});
