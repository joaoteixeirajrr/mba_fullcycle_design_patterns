import InvoiceRepository from "../repository/InvoiceRepository";
import PresenterFactory from "../presenter/PresenterFactory";
import DefaultPresenterFactory from "../presenter/DefaultPresenterFactory";
import Usecase from "./Usecase";

export default class GetInvoices implements Usecase {

	constructor (
		readonly invoiceRepository: InvoiceRepository,
		readonly presenterFactory: PresenterFactory = new DefaultPresenterFactory()
	) {
	}

	async execute (input: Input): Promise<any> {
		const presenter = this.presenterFactory.create(input.format);
		// O repositorio ja devolve as faturas do periodo/regime ordenadas por date crescente.
		// Periodo sem faturas => lista vazia.
		const invoices = await this.invoiceRepository.list(input.month, input.year, input.type);
		const output: Output[] = invoices.map((invoice) => ({ date: invoice.date, amount: invoice.amount }));
		return presenter.present(output);
	}
}

type Input = {
	month: number,
	year: number,
	type: string,
	format?: string
}

export type Output = {
	date: Date,
	amount: number
}
