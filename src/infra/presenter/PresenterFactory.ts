import Presenter from "../../application/presenter/Presenter";
import PresenterFactory from "../../application/presenter/PresenterFactory";
import JsonPresenter from "./JsonPresenter";
import CsvPresenter from "./CsvPresenter";

// Dynamic Factory de presenters, no molde de InvoiceGenerationFactory.
// Adicionar um formato novo no futuro exige mudar apenas esta classe (OCP), nunca os casos de uso.
export default class DefaultPresenterFactory implements PresenterFactory {

	create (format?: string): Presenter {
		if (!format || format === "json") {
			return new JsonPresenter();
		}
		if (format === "csv") {
			return new CsvPresenter();
		}
		throw new Error("Invalid format");
	}
}
