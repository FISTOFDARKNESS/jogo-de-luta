# Jogo de Luta 2D (Estilo Street Fighter)

Jogo de luta 2D para navegador, no estilo Street Fighter, com suporte a 1v1 online, 2v2 online e modo contra bot.

## Stack

- **Frontend:** Phaser 3 + Vite + TypeScript
- **Backend:** Node.js + Express + Socket.io
- **Lógica compartilhada:** `/shared` (agnóstica de plataforma)

## Estrutura

```
/jogo-de-luta
  /client        (Phaser + Vite)
  /server        (Node + Express + Socket.io)
  /shared        (lógica pura do jogo)
```

## Execução

```bash
# Instalar dependências de todos os lados
npm run install:all

# Iniciar cliente e servidor simultaneamente
npm run dev
```

- Cliente: http://localhost:3001
- Servidor: WebSocket na porta 3002

## Fases de Desenvolvimento

Consulte o documento mestre para as 14 fases organizadas em 3 blocos.