// Porta do servidor HTTP. O callback e tipado como Function; a convencao do contrato e a
// ordem e o significado dos argumentos entregues a ele: (params, body, headers, query).
// A query string e sempre o 4o argumento.
export default interface HttpServer {
	on (method: string, url: string, callback: Function): void;
	listen (port: number): void;
}
