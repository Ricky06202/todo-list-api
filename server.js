// server.js

// 1. Importaciones
import express from 'express'
import cors from 'cors'
import mysql from 'mysql2/promise'
import 'dotenv/config' // Carga las variables de entorno

// 2. Inicialización
const app = express()
// Usa la variable de entorno PORT, o 3001 si no está definida
const PORT = process.env.PORT || 3001

// Configuración de la base de datos - Usar DATABASE_URL o configurar valores por defecto
const DATABASE_URL =
  process.env.DATABASE_URL || 'mysql://root:@localhost:3306/todo_list'

// Mostrar configuración (sin contraseña por seguridad)
const dbUrl = new URL(DATABASE_URL)
console.log('🔌 Configuración de base de datos:', {
  host: dbUrl.hostname,
  database: dbUrl.pathname.replace(/^\//, ''),
  user: dbUrl.username,
  port: dbUrl.port || 3306,
})

// Crear el pool de conexiones con manejo de errores
let pool
try {
  pool = mysql.createPool(DATABASE_URL)
  console.log('✅ Pool de conexión a MySQL creado exitosamente')
} catch (error) {
  console.error('❌ Error al crear el pool de conexión:', error)
  process.exit(1)
}

// Función para ejecutar consultas SQL con mejor manejo de errores
const query = async (sql, params = []) => {
  let connection
  try {
    connection = await pool.getConnection()
    console.log('🔍 Ejecutando consulta:', { sql, params })
    const [results] = await connection.query(sql, params)
    return results
  } catch (error) {
    console.error('❌ Error en la consulta SQL:', {
      sql,
      params,
      error: error.message,
      code: error.code,
      sqlState: error.sqlState,
      sqlMessage: error.sqlMessage,
    })
    throw error // Re-lanzar el error para manejarlo en las rutas
  } finally {
    if (connection) {
      try {
        await connection.release()
      } catch (releaseError) {
        console.error('Error al liberar la conexión:', releaseError)
      }
    }
  }
}

// 3. Middlewares (Capa Intermedia)
// Habilita CORS para permitir solicitudes desde el frontend de Astro
// Configuración de CORS para permitir tanto producción como desarrollo local
const allowedOrigins = ['https://todolist.rsanjur.com', 'http://localhost:4321']

app.use(
  cors({
    origin: function (origin, callback) {
      // Permitir solicitudes sin 'origin' (como aplicaciones móviles o curl)
      if (!origin) return callback(null, true)

      if (allowedOrigins.indexOf(origin) === -1) {
        const msg = 'El origen de CORS no está permitido'
        console.warn(msg, origin)
        return callback(new Error(msg), false)
      }
      return callback(null, true)
    },
    credentials: true,
  })
)

// Permite a Express leer JSON en el cuerpo de las peticiones (POST, PUT)
app.use(express.json())

// Middleware para verificar que la base de datos está lista
// Debe ejecutarse después de CORS y JSON, pero ANTES de las rutas
app.use((req, res, next) => {
  // Las rutas de salud y la raíz no necesitan que la DB esté lista
  if (req.path === '/health' || req.path === '/') {
    return next()
  }

  if (!isDatabaseInitialized) {
    return res.status(503).json({
      status: 'error',
      message: 'Servicio no disponible. La base de datos no está lista.',
    })
  }
  next()
})

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
        `)
    console.log('✅ Tabla de todos inicializada')
  } catch (error) {
    console.error('Error al inicializar la base de datos:', error)
  }
}

// Inicializar la base de datos
let isDatabaseInitialized = false

const startServer = async () => {
  try {
    // Esperar a que la base de datos esté lista
    await initializeDatabase()
    isDatabaseInitialized = true

    // Iniciar el servidor
    app.listen(PORT, () => {
      console.log(
        `🚀 Servidor Express ejecutándose en http://localhost:${PORT}`
      )
      console.log(`🌐 Entorno: ${process.env.NODE_ENV || 'development'}`)
      console.log(
        `📊 Base de datos: ${dbUrl.hostname}/${dbUrl.pathname.replace(
          /^\//,
          ''
        )}`
      )
    })
  } catch (error) {
    console.error('❌ No se pudo iniciar el servidor:', error)
    process.exit(1)
  }
}

// Iniciar el servidor
startServer()

// 4. Definición de Rutas
app.get('/', (req, res) => {
  res.status(200).json({
    message: '✅ API de Lista de Tareas en línea',
    environment: process.env.NODE_ENV || 'development',
  })
})

// Obtener todas las tareas
app.get('/api/todos', async (req, res) => {
  try {
    const todos = await query('SELECT * FROM todos ORDER BY created_at DESC')
    res.json(todos)
  } catch (error) {
    console.error('Error al obtener tareas:', error)
    res.status(500).json({ message: 'Error al obtener las tareas' })
  }
})

// Obtener una tarea por ID
app.get('/api/todos/:id', async (req, res) => {
  try {
    const [todo] = await query('SELECT * FROM todos WHERE id = ?', [
      req.params.id,
    ])
    if (!todo) return res.status(404).json({ message: 'Tarea no encontrada' })
    res.json(todo)
  } catch (error) {
    console.error('Error al obtener tarea:', error)
    res.status(500).json({ message: 'Error al obtener la tarea' })
  }
})

// Crear una nueva tarea
app.post('/api/todos', async (req, res) => {
  if (!req.body.text) {
    return res
      .status(400)
      .json({ message: 'El texto de la tarea es requerido' })
  }

  try {
    const result = await query(
      'INSERT INTO todos (text, completed) VALUES (?, ?)',
      [req.body.text, false]
    )

    const [newTodo] = await query('SELECT * FROM todos WHERE id = ?', [
      result.insertId,
    ])
    res.status(201).json(newTodo)
  } catch (error) {
    console.error('Error al crear tarea:', error)
    res.status(500).json({ message: 'Error al crear la tarea' })
  }
})

// Actualizar una tarea (marcar como completada/no completada)
app.patch('/api/todos/:id', async (req, res) => {
  try {
    // Verificar si la tarea existe
    const [existingTodo] = await query('SELECT * FROM todos WHERE id = ?', [
      req.params.id,
    ])
    if (!existingTodo) {
      return res.status(404).json({ message: 'Tarea no encontrada' })
    }

    // Construir la consulta de actualización dinámicamente
    const updates = []
    const params = []

    if (typeof req.body.completed !== 'undefined') {
      updates.push('completed = ?')
      params.push(req.body.completed)
    }

    if (req.body.text) {
      updates.push('text = ?')
      params.push(req.body.text)
    }

    if (updates.length === 0) {
      return res
        .status(400)
        .json({ message: 'No se proporcionaron datos para actualizar' })
    }

    // Agregar el ID al final de los parámetros para el WHERE
    params.push(req.params.id)

    // Ejecutar la actualización
    await query(`UPDATE todos SET ${updates.join(', ')} WHERE id = ?`, params)

    // Obtener la tarea actualizada
    const [updatedTodo] = await query('SELECT * FROM todos WHERE id = ?', [
      req.params.id,
    ])
    res.json(updatedTodo)
  } catch (error) {
    console.error('Error al actualizar tarea:', error)
    res.status(500).json({ message: 'Error al actualizar la tarea' })
  }
})

// Eliminar una tarea
app.delete('/api/todos/:id', async (req, res) => {
  try {
    // Verificar si la tarea existe
    const [todo] = await query('SELECT * FROM todos WHERE id = ?', [
      req.params.id,
    ])
    if (!todo) {
      return res.status(404).json({ message: 'Tarea no encontrada' })
    }

    // Eliminar la tarea
    await query('DELETE FROM todos WHERE id = ?', [req.params.id])
    res.json(todo)
  } catch (error) {
    console.error('Error al eliminar tarea:', error)
    res.status(500).json({ message: 'Error al eliminar la tarea' })
  }
})

// Ruta de verificación de estado
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    database: isDatabaseInitialized ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  })
})
