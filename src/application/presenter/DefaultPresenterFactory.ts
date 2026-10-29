import Presenter from "./Presenter";
import PresenterFactory from "./PresenterFactory";
import DefaultJsonPresenter from "./DefaultJsonPresenter";

// Factory default da camada de aplicacao usada como default de construtor.
// Conhece apenas JSON (default/"json"); outros formatos exigem a factory de infra injetada no main.
// Mantem os casos de uso livres de imports de infra.
export default class DefaultPresenterFactory implements PresenterFactory {
	create (format?: string): Presenter {
		if (!format || format === "json") {
			return new DefaultJsonPresenter();
		}
		throw new Error("Invalid format");
	}
}
