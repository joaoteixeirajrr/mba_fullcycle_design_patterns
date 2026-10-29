/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Os testes de integracao compartilham o mesmo banco e a mesma tabela branas.invoice.
  // Serializar a execucao (um worker) evita corridas entre suites que mutam o mesmo periodo.
  maxWorkers: 1,
};
