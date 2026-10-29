import Mediator from "./Mediator";

// Mediator nulo (Null Object) usado como default de construtor na camada de aplicação,
// evitando que os casos de uso dependam de uma implementação de infra.
export default class NoopMediator implements Mediator {
	async publish (_event: string, _data: any): Promise<void> {
	}
}
