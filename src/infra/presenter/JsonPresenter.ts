import Presenter, { InvoiceDTO } from "../../application/presenter/Presenter";

export default class JsonPresenter implements Presenter {

	present(output: InvoiceDTO[]): any {
		return output;
	}

}
