document.addEventListener('DOMContentLoaded', () => {
    // 1. Leer el ID del boleto desde la URL (con fallback por si acaso)
    const params = new URLSearchParams(window.location.search);
    const idBoleto = params.get('id') || 'BOL-DEMO-001';
    document.getElementById('idBoleto').textContent = idBoleto;

    // 2. Generar el Código QR
    const contenedorQR = document.getElementById('contenedorQR');
    
    new QRCode(contenedorQR, {
        text: idBoleto,
        width: 200,
        height: 200,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });

    // 3. Lógica para descargar el boleto como imagen
    document.getElementById('btnDescargar').addEventListener('click', () => {
        let canvas = contenedorQR.querySelector('canvas');
        
        // Validación para navegadores que generan imagen en lugar de canvas
        if (!canvas) {
            const img = contenedorQR.querySelector('img');
            if (!img) return; // Si no hay ni canvas ni img, salimos
            canvas = img; // Reasignamos para que la descarga funcione con la imagen
        }

        // Si es canvas, usamos toDataURL, si es imagen, usamos src
        const imagenURL = canvas.toDataURL ? canvas.toDataURL("image/png") : canvas.src;
        
        const enlaceDescarga = document.createElement('a');
        enlaceDescarga.href = imagenURL;
        enlaceDescarga.download = `boleto_${idBoleto}.png`;
        enlaceDescarga.click();
    });
});