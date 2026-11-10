// Usado por `ng serve` (configuração "development"): aponta para a API rodando na sua máquina.
// Suba a API com: dotnet run --project Wyvern.Api --launch-profile http   (porta 5098)
export const environment = {
    production: false,
    apiUrl: 'http://localhost:5098',
    // Vazio: erros do desenvolvimento não vão para o Sentry (preencha só para testar a integração).
    sentryDsn: ''
}
