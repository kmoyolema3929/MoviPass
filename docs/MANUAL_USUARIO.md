# Manual de Usuario - MoviPass

Bienvenido al manual de usuario de **MoviPass**, la plataforma para la gestión y venta de pasajes de transporte interprovincial.

## Roles del Sistema

### 1. Cliente (Usuario Final)
**Flujo de compra:**
1. **Registro/Login:** El usuario se registra con su cédula y correo, o inicia sesión.
2. **Búsqueda:** En la página principal, selecciona origen, destino y fecha. El sistema consulta la base de datos y muestra las tarjetas con los viajes disponibles (cooperativa, hora, precio).
3. **Selección de asientos:** Al hacer clic en "Seleccionar asientos", se abre el mapa del bus. El usuario hace clic en los asientos disponibles (se marcan en azul) y continúa.
4. **Pago:** En el resumen de compra, el usuario revisa el total y sube su comprobante de transferencia o depósito (imagen o PDF).
5. **Confirmación:** El boleto queda en estado "Pendiente" hasta que el oficinista valide el pago.

### 2. Oficinista
**Validación de pagos:**
1. Inicia sesión con su cuenta.
2. Revisa la lista de pagos pendientes.
3. Abre el comprobante subido por el cliente.
4. Aprueba o rechaza el pago según corresponda.

### 3. Cooperativa
**Gestión de recursos:**
1. **Buses:** Registra, edita o elimina los buses de su flota (placa, chasis, carrocería).
2. **Asientos:** Define la plantilla de asientos de cada bus (pisos, filas, columnas, tipo VIP/normal).
3. **Frecuencias y Hojas de Ruta:** Registra los horarios de salida y genera las hojas de ruta asignando un bus y una fecha.

### 4. Administrador
**Gestión global:**
1. Inicia sesión como administrador.
2. Crea las cooperativas de transporte (nombre, RUC, dirección).
3. Asigna los usuarios gerentes a cada cooperativa.
4. Gestiona las cuentas de los oficinistas.

---
*Nota: Este manual se complementa con las capturas de pantalla detalladas en el informe final del proyecto.*