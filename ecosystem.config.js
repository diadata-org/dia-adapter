module.exports = {
  apps : [{
    name: 'dia-adapter',
    cwd: 'dist',
    script: 'main.js',
    restart_delay: 1000,
    watch: 'main.js',
    log_file: 'main.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss:SSS',
  }]
};

