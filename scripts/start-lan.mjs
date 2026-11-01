// Production LAN entry point, shared by npm start and npm run start:lan.
process.env.HOST = '0.0.0.0';
process.env.PORT ||= '3000';
process.env.NODE_ENV = 'production';
await import('../server.ts');
