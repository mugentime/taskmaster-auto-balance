# 🤖 TaskMaster - Automated Balance Management System

![TaskMaster Logo](https://img.shields.io/badge/TaskMaster-v1.0.0-blue?style=for-the-badge)
![Node.js](https://img.shields.io/badge/Node.js-18+-green?style=for-the-badge&logo=node.js)
![Binance](https://img.shields.io/badge/Binance-API-yellow?style=for-the-badge&logo=binance)

**TaskMaster** es un sistema automatizado de gestión de balances para bots de trading que maximiza la eficiencia de capital y optimiza automáticamente la asignación de fondos.

## 🎯 **Características Principales**

### ✅ **Gestión Automática de Balances**
- **Detección automática** de cambios en el portfolio (depósitos/retiros)
- **Optimización inteligente** de asignación de capital
- **Rebalance automático** cuando es necesario
- **Preservación de BNB** para descuentos en comisiones

### 📱 **Notificaciones Inteligentes** 
- **Telegram automático** para cambios importantes
- **Alertas de emergencia** para situaciones críticas
- **Cooldown inteligente** para evitar spam
- **Support para Discord** (opcional)

### 📊 **Monitoreo Avanzado**
- **Valoración completa** del portfolio en tiempo real
- **Análisis de riesgo** basado en utilización total
- **Identificación de oportunidades** de funding
- **Dashboard web** para visualización

### 🔄 **Automatización Completa**
- **Monitoreo continuo** cada 30 minutos (configurable)
- **Modo emergencia** con intervalos de 5 minutos
- **Detección de oportunidades** de funding rate
- **Logging completo** de actividad

## 🚀 **Instalación Local**

### Prerrequisitos
- Node.js 18 o superior
- Cuenta de Binance con API habilitada
- Bot de Telegram (opcional)
- Webhook de Discord (opcional)

### Pasos de Instalación

1. **Instalar dependencias**
```bash
npm install
```

2. **Configurar variables de entorno**
Edita `.env` con tus credenciales:
```env
BINANCE_API_KEY=tu_api_key_aqui
BINANCE_API_SECRET=tu_api_secret_aqui
TELEGRAM_BOT_TOKEN=tu_bot_token_aqui
TELEGRAM_CHAT_ID=tu_chat_id_aqui
DISCORD_WEBHOOK_URL=tu_webhook_discord_aqui
```

3. **Ejecutar el sistema**
```bash
# Iniciar TaskMaster con monitoreo automático
npm start

# Modo desarrollo (intervalos más rápidos)
npm run dev

# Solo verificación de balance
npm run balance-check

# Valoración completa del portfolio
npm run portfolio

# Test de notificaciones
npm run test-notifications
```

## ☁️ **Deployment en Render.com**

### Preparación

1. **Subir código a GitHub**
2. **Ejecutar script de deployment**
```bash
node deploy-to-render.js
```

### Proceso en Render

1. **Ir a [render.com](https://render.com)**
2. **Hacer clic en "New" → "Blueprint"**
3. **Conectar tu repositorio de GitHub**
4. **Render detectará automáticamente `render.yaml`**
5. **Configurar variables de entorno** para cada servicio

### Servicios Desplegados

- **taskmaster-backend** (Web): API endpoints y dashboard
- **taskmaster-auto-balance** (Background): Sistema de gestión automática
- **taskmaster-monitor** (Web): Dashboard de monitoreo

## 📊 **Sistema de Evaluación**

### Umbrales de Riesgo Realistas

- **✅ BAJO**: <50% utilización del portfolio
- **🟡 MEDIO**: 50-75% utilización del portfolio  
- **🔴 ALTO**: 75-90% utilización del portfolio
- **🚨 EXTREMO**: >90% utilización del portfolio

### Optimizaciones Inteligentes

- **Todo el portfolio cuenta** como colateral (no solo USDT)
- **BNB preservation** para descuentos en comisiones
- **USDT mínimo** solo para operaciones (8% del portfolio)
- **Crecimiento agresivo** hasta 60% de utilización objetivo

## 🔧 **Estado Actual**

### Tu Portfolio
- **Valor Total**: ~$120
- **Utilización Actual**: 46.2% (✅ Conservadora)
- **USDT Operacional**: $10.79 (✅ Suficiente)
- **Espacio para Crecimiento**: Hasta 60% objetivo

### Bots Activos
- **BIO Short Perp**: ~$30 (Funding: -0.74%)
- **RED Short Perp**: ~$25 (Funding: -0.19%)
- **Estado**: ✅ EXCELLENT

## 🚀 **Ready for Cloud Deployment**

El sistema está completamente preparado y optimizado para:
- **Detectar nuevas oportunidades** de funding
- **Sugerir más bots** cuando hay buenas oportunidades  
- **Alertar solo cuando es necesario** (>80% utilización)
- **Preservar BNB** para descuentos en comisiones
- **Monitoreo 24/7** con notificaciones inteligentes

---

**¡TaskMaster - Maximizando la eficiencia de tu capital de trading! 🚀**
