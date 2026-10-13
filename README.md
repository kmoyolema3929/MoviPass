# MoviPass

Aplicación web para la gestión y venta de pasajes de transporte interprovincial en Ecuador.

> Proyecto del segundo parcial de **Manejo y Configuración de Software**, Carrera de Software, Facultad de Ingeniería en Sistemas, Electrónica e Industrial (FISEI), Universidad Técnica de Ambato.

## Descripción
MoviPass permite a las cooperativas de transporte administrar sus buses, frecuencias y hojas de ruta, y a los usuarios buscar viajes, elegir asientos, pagar y obtener un boleto con código QR.

## Roles del sistema
| Rol | Función |
|---|---|
| Administrador | Crea cooperativas y su usuario gerente |
| Cooperativa | Gestiona buses, frecuencias, rutas y precios |
| Oficinista | Vende boletos y aprueba comprobantes de pago |
| Usuario final | Busca viajes, compra y consulta su historial |
| Usuario bus | Valida boletos y cobra en ruta |

## Tecnologías
| Capa | Tecnología |
|---|---|
| Frontend | HTML5, CSS3, JavaScript, Bootstrap 5 |
| Backend | Java 21, Spring Boot 3, Maven |
| Base de datos | PostgreSQL |
| Autenticación | Spring Security, JWT (jjwt) y BCrypt |
| Migraciones | Flyway |
| Archivos subidos (comprobantes y fotos de buses) | MultipartFile |
| Código QR | ZXing |
| Correos | Spring Mail |
| Tareas programadas | @Scheduled |
| Validaciones | Bean Validation |

## Requisitos previos
- JDK 21
- PostgreSQL
- Git

## Instalación y ejecución
```bash
git clone https://github.com/kmoyolema3929/MoviPass.git
cd MoviPass
git checkout develop

# Variables de entorno
cp .env.example .env     # completa los valores en .env

# Backend (Spring Boot)
cd backend
./mvnw spring-boot:run   # en Windows: mvnw.cmd spring-boot:run
```
La aplicación queda disponible en `http://localhost:8080`. Las instrucciones de la base de datos estarán en `database/`.

## Estructura del repositorio
```
backend/    API, reglas de negocio y acceso a datos
frontend/   Pantallas (HTML, CSS, JavaScript, Bootstrap)
database/   Migraciones y datos de prueba (SQL)
docs/       Documentación y capturas
.github/    Plantillas de issues y pull requests
```

## Flujo de trabajo
Usamos **Gitflow** y control de cambios formal. Ver [CONTRIBUTING.md](CONTRIBUTING.md), [docs/FLUJO_GIT.md](docs/FLUJO_GIT.md) y [docs/CONTROL_DE_CAMBIOS.md](docs/CONTROL_DE_CAMBIOS.md).

## Equipo
| Integrante | Rol de gestión |
|---|---|
| Katherine Moyolema | Líder - Desarrollo |
| Alisson Paredes | Comité de control de cambios - Desarrollo |
| Anahi Molina | Comité de control de cambios - Desarrollo |
| Alina Ortiz | Desarrollo |
| Mateo Herrera | Desarrollo |
| Julio Zurita | Documentación - Desarrollo |

## Soporte
Ver [SUPPORT.md](SUPPORT.md).

## Licencia
GPL v3. Ver [LICENSE](LICENSE).

## Cómo citar
Ver [CITATION.cff](CITATION.cff).