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

const WIDTH = 800;
const HEIGHT = 800;

function inGranada(lon, lat) {
  return (
    lon >= GRANADA_BBOX.west && lon <= GRANADA_BBOX.east &&
    lat >= GRANADA_BBOX.south && lat <= GRANADA_BBOX.north
  );
}

app.get('/fwi/granada', async (req, res) => {
  try {
    // Leer el umbral desde el query param (por defecto: 11)
    const umbral = req.query.umbral ? parseFloat(req.query.umbral) : 11;
    // Fecha actual en formato YYYY-MM-DD
    const today = new Date().toISOString().slice(0,10);
    // WMS URL para EFFIS FWI
    const FWI_URL = `https://maps.effis.emergency.copernicus.eu/effis?LAYERS=ecmwf007.fwi&FORMAT=image/tiff&TRANSPARENT=true&SINGLETILE=false&SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&STYLES=&SRS=EPSG:4326&BBOX=${GRANADA_BBOX.west},${GRANADA_BBOX.south},${GRANADA_BBOX.east},${GRANADA_BBOX.north}&WIDTH=${WIDTH}&HEIGHT=${HEIGHT}&TIME=${today}`;
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
        const lon = geoTransform[0] + px * geoTransform[1] + py * geoTransform[2];
        const lat = geoTransform[3] + px * geoTransform[4] + py * geoTransform[5];
        if (!inGranada(lon, lat)) continue;
        const fwi = band.pixels.get(px, py);
        if (fwi >= umbral) {
          let nivel = '';
          if (fwi < 5) nivel = 'Muy bajo';
          else if (fwi < 11) nivel = 'Bajo';
          else if (fwi < 21) nivel = 'Moderado';
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
      umbral_usado: umbral,
      total: fwiPoints.length, 
      puntos: fwiPoints 
    });

  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

app.get('/', (req, res) => {
  res.send('Servicio FWI Granada - Usa /fwi/granada?umbral=0 para mostrar todos los puntos');
});

app.listen(PORT, () => {
  console.log(`Servicio escuchando en puerto ${PORT}`);
});
