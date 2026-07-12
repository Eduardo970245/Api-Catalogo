const express = require('express');
const cors = require('cors');
const pool = require('./db');
const verificarToken = require('./middleware/verificarToken');
const soloAdmin = require('./middleware/soloAdmin');

const app = express();
app.use(express.json());
//app.use(cors());

/*
CREATE TABLE autores (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  nacionalidad VARCHAR(50)
);

CREATE TABLE libros (
  id SERIAL PRIMARY KEY,
  titulo VARCHAR(150) NOT NULL,
  autor_id INTEGER REFERENCES autores(id),
  stock INTEGER DEFAULT 1,
  disponibles INTEGER DEFAULT 1
);
*/

// ================= AUTORES =================

// 1. OBTENER TODOS LOS AUTORES (público)
app.get('/autores', async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM autores ORDER BY id');
    res.json(resultado.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. CREAR AUTOR (solo admin)
app.post('/autores', verificarToken, soloAdmin, async (req, res) => {
  try {
    const { nombre, nacionalidad } = req.body;
    const nuevo = await pool.query(
      'INSERT INTO autores (nombre, nacionalidad) VALUES ($1, $2) RETURNING *',
      [nombre, nacionalidad]
    );
    res.status(201).json(nuevo.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. ACTUALIZAR AUTOR (solo admin)
app.put('/autores/:id', verificarToken, soloAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, nacionalidad } = req.body;
    const resultado = await pool.query(
      'UPDATE autores SET nombre = $1, nacionalidad = $2 WHERE id = $3 RETURNING *',
      [nombre, nacionalidad, id]
    );
    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'Autor no encontrado' });
    }
    res.json(resultado.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. ELIMINAR AUTOR (solo admin)
app.delete('/autores/:id', verificarToken, soloAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM autores WHERE id = $1', [id]);
    res.json({ mensaje: 'Autor eliminado correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= LIBROS =================

// 1. OBTENER TODOS LOS LIBROS (público, con nombre de autor incluido)
app.get('/libros', async (req, res) => {
  try {
    const resultado = await pool.query(`
      SELECT l.id, l.titulo, l.stock, l.disponibles,
             a.id AS autor_id, a.nombre AS autor_nombre
      FROM libros l
      LEFT JOIN autores a ON l.autor_id = a.id
      ORDER BY l.id
    `);
    res.json(resultado.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. OBTENER UN LIBRO POR ID (público)
app.get('/libros/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await pool.query('SELECT * FROM libros WHERE id = $1', [id]);
    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'Libro no encontrado' });
    }
    res.json(resultado.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. CREAR LIBRO (solo admin)
app.post('/libros', verificarToken, soloAdmin, async (req, res) => {
  try {
    const { titulo, autor_id, stock } = req.body;
    const nuevo = await pool.query(
      'INSERT INTO libros (titulo, autor_id, stock, disponibles) VALUES ($1, $2, $3, $3) RETURNING *',
      [titulo, autor_id, stock || 1]
    );
    res.status(201).json(nuevo.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. ACTUALIZAR LIBRO TOTAL (solo admin)
app.put('/libros/:id', verificarToken, soloAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { titulo, autor_id, stock, disponibles } = req.body;
    const resultado = await pool.query(
      'UPDATE libros SET titulo=$1, autor_id=$2, stock=$3, disponibles=$4 WHERE id=$5 RETURNING *',
      [titulo, autor_id, stock, disponibles, id]
    );
    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'Libro no encontrado' });
    }
    res.json(resultado.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. ACTUALIZAR PARCIAL (solo admin) — igual patrón que tu ejemplo de productos
app.patch('/libros/:id', verificarToken, soloAdmin, async (req, res) => {
  const { id } = req.params;
  const campos = req.body;
  if (Object.keys(campos).length === 0) {
    return res.status(400).json({ error: 'No se enviaron campos para actualizar' });
  }
  try {
    const llaves = Object.keys(campos);
    const valores = Object.values(campos);
    const setQuery = llaves.map((llave, i) => `${llave} = $${i + 1}`).join(', ');
    const query = `UPDATE libros SET ${setQuery} WHERE id = $${llaves.length + 1} RETURNING *`;
    const resultado = await pool.query(query, [...valores, id]);
    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'Libro no encontrado' });
    }
    res.json({ mensaje: 'Actualizado con éxito', libro: resultado.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. ELIMINAR LIBRO (solo admin)
app.delete('/libros/:id', verificarToken, soloAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM libros WHERE id = $1', [id]);
    res.json({ mensaje: 'Libro eliminado correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= USADA POR ms-prestamos =================
// Ruta interna para que ms-prestamos valide/descuente disponibilidad
app.patch('/libros/:id/disponibilidad', verificarToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { accion } = req.body; // 'prestar' o 'devolver'

    const libro = await pool.query('SELECT * FROM libros WHERE id = $1', [id]);
    if (libro.rows.length === 0) {
      return res.status(404).json({ error: 'Libro no encontrado' });
    }

    const disponibles = libro.rows[0].disponibles;
    if (accion === 'prestar') {
      if (disponibles <= 0) {
        return res.status(400).json({ error: 'No hay ejemplares disponibles' });
      }
      const actualizado = await pool.query(
        'UPDATE libros SET disponibles = disponibles - 1 WHERE id = $1 RETURNING *',
        [id]
      );
      return res.json(actualizado.rows[0]);
    }

    if (accion === 'devolver') {
      const actualizado = await pool.query(
        'UPDATE libros SET disponibles = disponibles + 1 WHERE id = $1 RETURNING *',
        [id]
      );
      return res.json(actualizado.rows[0]);
    }

    res.status(400).json({ error: 'Acción no válida' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 6002;
app.listen(PORT, () => {
  console.log(`ms-catalogo escuchando en http://localhost:${PORT}`);
});
