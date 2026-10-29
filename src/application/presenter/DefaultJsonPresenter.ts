import Presenter, { InvoiceDTO } from "./Presenter";

// Presenter JSON default da camada de aplicação (Null-ish Object), para que os casos de uso
// não precisem importar uma implementação de infra como default de construtor.
export default class DefaultJsonPresenter implements Presenter {
	present (output: InvoiceDTO[]): any {
		return output;
	}
}
