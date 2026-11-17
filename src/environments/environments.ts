export const environment = {
    production: true,
    apiUrl: 'https://api.wyvern.sbs',
    // Endereço público do site, para links que saem do app (convites). No app do celular o endereço da página é
    // http://localhost, que não abre em outro aparelho.
    urlDoSite: 'https://wyvern.sbs',
    // DSN do projeto Angular no Sentry (não é segredo: vai junto no JavaScript). Vazio = monitoramento desligado.
    sentryDsn: 'https://23e4033e67df2ace0bc47f6c53f69df8@o4512408863899648.ingest.us.sentry.io/4512408916393984'
}
