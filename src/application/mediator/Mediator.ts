// Porta (abstração) do Mediator na camada de aplicação.
// Os casos de uso dependem desta interface; a implementação concreta vive em src/infra/mediator.
export default interface Mediator {
	publish (event: string, data: any): Promise<void>;
}
