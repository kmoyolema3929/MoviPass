document.addEventListener('DOMContentLoaded', () => {
    // 1. Simulamos obtener el ID del boleto
    const idBoleto = "BOL-" + Math.floor(Math.random() * 1000000);
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
        const canvas = contenedorQR.querySelector('canvas');
        if (!canvas) return;

        const imagenURL = canvas.toDataURL("image/png");
        
        const enlaceDescarga = document.createElement('a');
        enlaceDescarga.href = imagenURL;
        enlaceDescarga.download = `boleto_${idBoleto}.png`;
        enlaceDescarga.click();
    });
});