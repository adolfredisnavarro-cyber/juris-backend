const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Archivo de base de datos local SQLite
const dbPath = path.resolve(__dirname, 'juris_database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error al conectar con SQLite:', err.message);
    } else {
        console.log('Conectado a la base de datos SQLite local.');
    }
});

// Creación de tablas esenciales para abogados
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT,
        correo TEXT UNIQUE,
        password TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    documento TEXT,
    telefono TEXT,
    email TEXT,
    direccion TEXT
)`);

    db.run(`CREATE TABLE IF NOT EXISTS procesos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_id INTEGER,
        radicado TEXT,
        juzgado TEXT,
        estado TEXT,
        fecha_inicio TEXT,
        fecha_proxima_actuacion TEXT,
        observaciones TEXT,
        FOREIGN KEY(cliente_id) REFERENCES clientes(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS recordatorios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        proceso_id INTEGER,
        fecha_recordatorio TEXT,
        enviado BOOLEAN DEFAULT 0,
        FOREIGN KEY(proceso_id) REFERENCES procesos(id)
    )`);
    // 5. Control Financiero (Honorarios, Anticipos, Gastos, Pagos)
    db.run(`CREATE TABLE IF NOT EXISTS finanzas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        proceso_id INTEGER,
        tipo TEXT, -- 'Honorario', 'Anticipo', 'Gasto Judicial', 'Pago Pendiente'
        monto REAL NOT NULL,
        descripcion TEXT,
        fecha TEXT,
        estado_pago TEXT DEFAULT 'Pendiente',
        FOREIGN KEY(proceso_id) REFERENCES procesos(id)
    )`);

    // 6. Documentos y Archivos Escaneados (Poderes, Demandas, Pruebas, etc.)
    db.run(`CREATE TABLE IF NOT EXISTS documentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        proceso_id INTEGER,
        categoria TEXT, -- 'Poder', 'Demanda', 'Contestacion', 'Prueba', 'Sentencia'
        nombre_archivo TEXT,
        ruta_archivo TEXT,
        fecha_subida TEXT,
        FOREIGN KEY(proceso_id) REFERENCES procesos(id)
    )`);
    // 5. Control Financiero (Honorarios, Anticipos, Gastos, Pagos)
    db.run(`CREATE TABLE IF NOT EXISTS finanzas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        proceso_id INTEGER,
        tipo TEXT, -- 'Honorario', 'Anticipo', 'Gasto Judicial', 'Pago Pendiente'
        monto REAL NOT NULL,
        descripcion TEXT,
        fecha TEXT,
        estado_pago TEXT DEFAULT 'Pendiente',
        FOREIGN KEY(proceso_id) REFERENCES procesos(id)
    )`);
});

module.exports = db;