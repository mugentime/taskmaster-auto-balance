module.exports = {
  apps: [
    {
      name: 'api-server',
      script: 'server.js',
      cwd: '.',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      error_file: './logs/api.err.log',
      out_file: './logs/api.out.log',
      log_file: './logs/api.combined.log',
      time: true
    },
    {
      name: 'automation-engine',
      script: 'automation-engine.js',
      args: 'start',
      cwd: '.',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/automation-engine.err.log',
      out_file: './logs/automation-engine.out.log',
      log_file: './logs/automation-engine.combined.log',
      time: true
    },
    {
      name: 'telegram-bot',
      script: 'telegram-bot-commands.js',
      cwd: '.',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/telegram-bot.err.log',
      out_file: './logs/telegram-bot.out.log',
      log_file: './logs/telegram-bot.combined.log',
      time: true
    }
  ]
};
