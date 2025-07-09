import express from "express"
import cors from "cors"
import helmet from "helmet"
import morgan from "morgan"
import rateLimit from "express-rate-limit"
import dotenv from "dotenv"

// Importar rutas
import authRoutes from "./routes/auth.js"
import roomRoutes from "./routes/rooms.js"
import reservationRoutes from "./routes/reservation.js"
import eventRoutes from "./routes/events.js"
import reportRoutes from "./routes/reports.js"
import publicRoutes from "./routes/public.js"

// Importar middleware
import { errorHandler } from "./middleware/errorHandler.js"
import { notFound } from "./middleware/notFound.js"

// Configurar variables de entorno
dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: {
    success: false,
    message: "Demasiadas peticiones, intenta de nuevo más tarde",
  },
  standardHeaders: true,
  legacyHeaders: false,
})

// Middleware de seguridad
app.use(helmet())
app.use(limiter)

// CORS
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  }),
)


app.use(morgan("combined"))

app.use(express.json({ limit: "10mb" }))
app.use(express.urlencoded({ extended: true }))

app.use("/api/public", publicRoutes)

app.use("/api/auth", authRoutes)
app.use("/api/rooms", roomRoutes)
app.use("/api/reservations", reservationRoutes)
app.use("/api/events", eventRoutes)
app.use("/api/reports", reportRoutes)

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Servidor funcionando correctamente",
    timestamp: new Date().toISOString(),
  })
})
app.get("/", (req, res) => {
  res.json({ message: "API corriendo correctamente 🚀" });
});


app.use(notFound)
app.use(errorHandler)

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});

export default app
