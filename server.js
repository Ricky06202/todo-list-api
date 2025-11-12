// server.js

// 1. Importaciones
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
require('dotenv').config(); // Carga las variables de entorno

// 2. Inicialización
const app = express();
// Usa la variable de entorno PORT, o 3001 si no está definida
const PORT = process.env.PORT || 3001;

// Configuración de la conexión a MySQL usando DATABASE_URL
const dbConfig = process.env.DATABASE_URL || {
    host: 'localhost',
    user: 'tu_usuario',
    password: 'tu_contraseña',
    database: 'nombre_de_tu_base_de_datos',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// Crear el pool de conexiones
const pool = mysql.createPool(process.env.DATABASE_URL || dbConfig);

// Función para ejecutar consultas SQL
const query = async (sql, params) => {
    const connection = await pool.getConnection();
    try {
        const [results] = await connection.query(sql, params);
        return results;
    } finally {
        connection.release();
    }
}; 

// 3. Middlewares (Capa Intermedia)
// Habilita CORS para permitir solicitudes desde el frontend de Astro
app.use(cors({
    // NOTA: Configura esto con el puerto de desarrollo de Astro (típicamente 4321)
    origin: 'https://todolist.rsanjur.com'
}));

// Permite a Express leer JSON en el cuerpo de las peticiones (POST, PUT)
app.use(express.json());


// Crear la tabla de todos si no existe
const initializeDatabase = async () => {
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS todos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                text VARCHAR(255) NOT NULL,
                completed BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Tabla de todos inicializada');
    } catch (error) {
        console.error('Error al inicializar la base de datos:', error);
    }
};

// Inicializar la base de datos
initializeDatabase();

// 4. Definición de Rutas
app.get('/', (req, res) => {
    res.status(200).json({ 
        message: '✅ API de Lista de Tareas en línea',
        environment: process.env.NODE_ENV || 'development'
    });
});

// Obtener todas las tareas
app.get('/api/todos', async (req, res) => {
    try {
        const todos = await query('SELECT * FROM todos ORDER BY created_at DESC');
        res.json(todos);
    } catch (error) {
        console.error('Error al obtener tareas:', error);
        res.status(500).json({ message: 'Error al obtener las tareas' });
    }
});

// Obtener una tarea por ID
app.get('/api/todos/:id', async (req, res) => {
    try {
        const [todo] = await query('SELECT * FROM todos WHERE id = ?', [req.params.id]);
        if (!todo) return res.status(404).json({ message: 'Tarea no encontrada' });
        res.json(todo);
    } catch (error) {
        console.error('Error al obtener tarea:', error);
        res.status(500).json({ message: 'Error al obtener la tarea' });
    }
});

// Crear una nueva tarea
app.post('/api/todos', async (req, res) => {
    if (!req.body.text) {
        return res.status(400).json({ message: 'El texto de la tarea es requerido' });
    }
    
    try {
        const result = await query(
            'INSERT INTO todos (text, completed) VALUES (?, ?)',
            [req.body.text, false]
        );
        
        const [newTodo] = await query('SELECT * FROM todos WHERE id = ?', [result.insertId]);
        res.status(201).json(newTodo);
    } catch (error) {
        console.error('Error al crear tarea:', error);
        res.status(500).json({ message: 'Error al crear la tarea' });
    }
});

// Actualizar una tarea (marcar como completada/no completada)
app.patch('/api/todos/:id', async (req, res) => {
    try {
        // Verificar si la tarea existe
        const [existingTodo] = await query('SELECT * FROM todos WHERE id = ?', [req.params.id]);
        if (!existingTodo) {
            return res.status(404).json({ message: 'Tarea no encontrada' });
        }
        
        // Construir la consulta de actualización dinámicamente
        const updates = [];
        const params = [];
        
        if (typeof req.body.completed !== 'undefined') {
            updates.push('completed = ?');
            params.push(req.body.completed);
        }
        
        if (req.body.text) {
            updates.push('text = ?');
            params.push(req.body.text);
        }
        
        if (updates.length === 0) {
            return res.status(400).json({ message: 'No se proporcionaron datos para actualizar' });
        }
        
        // Agregar el ID al final de los parámetros para el WHERE
        params.push(req.params.id);
        
        // Ejecutar la actualización
        await query(
            `UPDATE todos SET ${updates.join(', ')} WHERE id = ?`,
            params
        );
        
        // Obtener la tarea actualizada
        const [updatedTodo] = await query('SELECT * FROM todos WHERE id = ?', [req.params.id]);
        res.json(updatedTodo);
    } catch (error) {
        console.error('Error al actualizar tarea:', error);
        res.status(500).json({ message: 'Error al actualizar la tarea' });
    }
});

// Eliminar una tarea
app.delete('/api/todos/:id', async (req, res) => {
    try {
        // Verificar si la tarea existe
        const [todo] = await query('SELECT * FROM todos WHERE id = ?', [req.params.id]);
        if (!todo) {
            return res.status(404).json({ message: 'Tarea no encontrada' });
        }
        
        // Eliminar la tarea
        await query('DELETE FROM todos WHERE id = ?', [req.params.id]);
        res.json(todo);
    } catch (error) {
        console.error('Error al eliminar tarea:', error);
        res.status(500).json({ message: 'Error al eliminar la tarea' });
    }
});

// 5. Arrancar el servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor Express ejecutándose en http://localhost:${PORT}`);
});