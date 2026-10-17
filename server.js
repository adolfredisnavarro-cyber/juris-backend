require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const PDFDocument = require('pdfkit');
const fs = require('fs');        
const path = require('path');   
const pdfParse = require('pdf-parse');
const { GoogleGenAI } = require('@google/genai');
const db = require('./database');

const app = express();
app.use(cors());
app.use(express.json());

// Inicializar la IA de Gemini con la API Key del entorno
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// --- ENDPOINTS DE CLIENTES ---

// Obtener clientes
app.get('/api/clientes', (req, res) => {
    db.all(`SELECT * FROM clientes ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ clientes: rows });
    });
});

// Registrar un nuevo cliente
app.post('/api/clientes', (req, res) => {
    const { nombre, telefono, email, direccion, documento } = req.body;
    const query = `INSERT INTO clientes (nombre, telefono, email, direccion, documento) VALUES (?, ?, ?, ?, ?)`;
    
    db.run(query, [nombre, telefono, email, direccion, documento], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Cliente registrado exitosamente', id: this.lastID });
    });
});

// --- ENDPOINTS DE PROCESOS ---

// Obtener todos los procesos con su respectivo cliente
app.get('/api/procesos', (req, res) => {
    const query = `
        SELECT procesos.*, clientes.nombre as cliente_nombre 
        FROM procesos 
        LEFT JOIN clientes ON procesos.cliente_id = clientes.id
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ procesos: rows });
    });
});

// Crear un nuevo proceso
app.post('/api/procesos', (req, res) => {
    const { cliente_id, radicado, juzgado, estado, fecha_inicio, fecha_proxima_actuacion, observaciones } = req.body;
    const query = `INSERT INTO procesos (cliente_id, radicado, juzgado, estado, fecha_inicio, fecha_proxima_actuacion, observaciones) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    
    db.run(query, [cliente_id, radicado, juzgado, estado, fecha_inicio, fecha_proxima_actuacion, observaciones], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Proceso creado exitosamente', id: this.lastID });
    });
});

// --- SISTEMA AUTOMÁTICO DE RECORDATORIOS (NODE-CRON) ---
cron.schedule('0 8 * * *', () => {
    console.log('⚖️ Verificando plazos judiciales y vencimientos...');
    const hoy = new Date().toISOString().split('T')[0];
    
    db.all(`SELECT * FROM procesos WHERE fecha_proxima_actuacion = ?`, [hoy], (err, rows) => {
        if (!err && rows.length > 0) {
            rows.forEach(proc => {
                console.log(`⚠️ ALERTA: El proceso radicado ${proc.radicado} vence hoy.`);
            });
        }
    });
});

// --- ENDPOINTS DE CONTROL FINANCIERO ---

app.post('/api/finanzas', (req, res) => {
    const { proceso_id, tipo, monto, descripcion, fecha, estado_pago } = req.body;
    const sql = `INSERT INTO finanzas (proceso_id, tipo, monto, descripcion, fecha, estado_pago) VALUES (?, ?, ?, ?, ?, ?)`;
    
    db.run(sql, [proceso_id, tipo, monto, descripcion, fecha, estado_pago || 'Pendiente'], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ message: 'Movimiento financiero registrado con éxito', id: this.lastID });
    });
});

app.get('/api/finanzas', (req, res) => {
    const sql = `
        SELECT f.id, f.tipo, f.monto, f.descripcion, f.fecha, f.estado_pago, p.radicado 
        FROM finanzas f
        LEFT JOIN procesos p ON f.proceso_id = p.id
        ORDER BY f.fecha DESC
    `;
    
    db.all(sql, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ finanzas: rows });
    });
});

// --- ENDPOINT DE GENERACIÓN DE PODERES NOTARIALES ---
app.post('/api/documentos/generar-pdf', (req, res) => {
    const { 
        tipo_poder, 
        cliente_nombre, 
        documento_identidad, 
        ciudad_expedicion, 
        estado_civil, 
        ciudad_notaria, 
        numero_notaria, 
        abogado_nombre, 
        abogado_cc, 
        inmueble_matricula, 
        inmueble_cedula_catastral, 
        afectacion_vivienda,
        detalles_especificos 
    } = req.body;

    const doc = new PDFDocument({ margin: 50 });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=poder_${tipo_poder ? tipo_poder.toLowerCase() : 'especial'}.pdf`);
    
    doc.pipe(res);

    // Encabezado Notarial Común
    doc.fontSize(12).font('Helvetica-Bold').text('SEÑORES', { align: 'left' });
    doc.text(`NOTARÍA ${numero_notaria || 'PRIMERA'}`, { align: 'left' });
    doc.text(`DEL CÍRCULO DE ${(ciudad_notaria || 'MONTERÍA').toUpperCase()}`, { align: 'left' });
    doc.text('CIUDAD', { align: 'left' });
    doc.moveDown();

    let tituloPoder = 'PODER ESPECIAL';
    if (tipo_poder === 'Compraventa') tituloPoder = 'PODER ESPECIAL PARA COMPRAVENTA DE INMUEBLE';
    if (tipo_poder === 'Sucesion') tituloPoder = 'PODER ESPECIAL PARA TRÁMITE DE SUCESIÓN';
    if (tipo_poder === 'Judicial') tituloPoder = 'PODER ESPECIAL PARA REPRESENTACIÓN JUDICIAL';

    doc.fontSize(14).font('Helvetica-Bold').text(tituloPoder, { align: 'center' });
    doc.moveDown();

    // Párrafo de Identificación
    doc.fontSize(11).font('Helvetica').text(
        `Yo, ${cliente_nombre || '____________________'}, mayor de edad, vecino(a) y domiciliado(a) en la ciudad de ${ciudad_expedicion || '___________'}, identificado(a) con la cédula de ciudadanía número ${documento_identidad || '___________'}, de estado civil ${estado_civil || 'soltero(a)'}, obrando en nombre propio, confiero PODER ESPECIAL, AMPLIO Y SUFICIENTE a ${abogado_nombre || '____________________'}, mayor de edad, domiciliado y residente en la misma ciudad, identificado con la cédula de ciudadanía número ${abogado_cc || '___________'}, para que en mi nombre y representación realice el siguiente encargo:`
    );
    doc.moveDown();

    // Cuerpo específico según el tipo de poder
    if (tipo_poder === 'Compraventa') {
        doc.fontSize(11).font('Helvetica-Bold').text('OBJETO DEL PODER (COMPRAVENTA):', { underline: true });
        doc.font('Helvetica').text(`Firme escritura pública de compraventa del inmueble con Matrícula Inmobiliaria No.: ${inmueble_matricula || '_________________'} y Cédula Catastral No.: ${inmueble_cedula_catastral || '_________________'}.`);
        doc.moveDown();
        doc.text(`Manifestamos bajo la gravedad del juramento que el predio ${afectacion_vivienda || 'NO'} se afecta a vivienda familiar.`);
        doc.moveDown();
        doc.text(`El apoderado queda facultado para fijar precio, recibir dineros, firmar escrituras aclaratorias y realizar todos los trámites pertinentes.`);
    } else if (tipo_poder === 'Sucesion') {
        doc.fontSize(11).font('Helvetica-Bold').text('OBJETO DEL PODER (SUCESIÓN / HERENCIA):', { underline: true });
        doc.font('Helvetica').text(`Me represente en el trámite de liquidación de herencia notarial o judicial de los bienes causados por el(la) causante ${detalles_especificos || '________________________________'}.`);
        doc.moveDown();
        doc.text(`Mi apoderado queda facultado para aceptar herencias con beneficio de inventario, firmar la escritura de partición y adjudicación, conciliar y suscribir los documentos necesarios.`);
    } else {
        doc.fontSize(11).font('Helvetica-Bold').text('OBJETO DEL PODER (JUDICIAL / PLEITOS):', { underline: true });
        doc.font('Helvetica').text(`Me represente judicialmente en todas las instancias y actuaciones del proceso correspondiente a: ${detalles_especificos || '________________________________'}.`);
        doc.moveDown();
        doc.text(`El apoderado queda facultado para demandar, contestar, conciliar, transigir, desistir, sustituir y realizar todas las actuaciones procesales consagradas en la ley.`);
    }

    doc.moveDown(2);

    // Firmas
    doc.text('Cordialmente,', { align: 'left' });
    doc.moveDown(3);

    doc.text('_____________________________________');
    doc.font('Helvetica-Bold').text(cliente_nombre || 'El Poderdante');
    doc.font('Helvetica').text(`C.C. ${documento_identidad || '_________________'}`);
    doc.moveDown(2);

    doc.text('Acepto el poder,');
    doc.moveDown(3);
    doc.text('_____________________________________');
    doc.font('Helvetica-Bold').text(abogado_nombre || 'El Apoderado');
    doc.font('Helvetica').text(`C.C. ${abogado_cc || '_________________'}`);

    doc.end();
});

// --- ENDPOINT DE IA JURÍDICA (OPTIMIZADO PARA MEMORIA) ---
app.post(['/api/ia/consulta', '/api/ia/consulta-juridica'], async (req, res) => {
    const { pregunta } = req.body;
    
    const pdfPath = path.join(__dirname, 'cgp.pdf');
    
    if (!fs.existsSync(pdfPath)) {
        return res.status(404).json({ error: 'El archivo PDF del Código General del Proceso no se encuentra en la raíz del proyecto.' });
    }

    try {
        const dataBuffer = fs.readFileSync(pdfPath);
        const data = await pdfParse(dataBuffer);
        const contenidoPdf = data.text;

        const promptSistema = `
            Actúa como un asistente jurídico experto en derecho procesal colombiano. 
            Utiliza EXCLUSIVAMENTE la siguiente información extraída del Código General del Proceso para responder con rigor y precisión a la consulta del abogado:
            
            --- TEXTO DEL CGP ---
            ${contenidoPdf.substring(0, 20000)}
            ---------------------

            Pregunta del abogado: ${pregunta}
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: promptSistema,
        });

        res.json({ 
            respuesta: response.text
        });

    } catch (error) {
        console.error('Error procesando la consulta:', error);
        
        if (error?.status === 404) {
            return res.status(502).json({
                error: 'El modelo de Gemini configurado no está disponible para esta cuenta.'
            });
        }
        if (error?.status === 503) {
            return res.status(503).json({
                error: 'El modelo de Gemini está temporalmente saturado. Intenta nuevamente en unos segundos.'
            });
        }
        res.status(500).json({ error: 'Ocurrió un error al procesar la solicitud con la IA de Gemini.' });
    }
});

// --- INICIAR SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});
