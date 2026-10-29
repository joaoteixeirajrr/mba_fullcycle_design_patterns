import ContractRepository from "../repository/ContractRepository";
import InvoiceRepository, { InvoiceData } from "../repository/InvoiceRepository";
import PresenterFactory from "../presenter/PresenterFactory";
import DefaultPresenterFactory from "../presenter/DefaultPresenterFactory";
import Mediator from "../mediator/Mediator";
import NoopMediator from "../mediator/NoopMediator";
import Usecase from "./Usecase";

export default class CloseInvoicing implements Usecase {

	constructor (
		readonly contractRepository: ContractRepository,
		readonly invoiceRepository: InvoiceRepository,
		readonly presenterFactory: PresenterFactory = new DefaultPresenterFactory(),
		readonly mediator: Mediator = new NoopMediator()
	) {
	}

	async execute (input: Input): Promise<any> {
		// format invalido falha ANTES de qualquer efeito (nada e removido nem persistido).
		const presenter = this.presenterFactory.create(input.format);
		// Gera as faturas do periodo contrato a contrato, pareando com o id_contract.
		// A regra de calculo permanece nas strategies do dominio (contract.generateInvoices).
		const toPersist: InvoiceData[] = [];
		const contracts = await this.contractRepository.list();
		for (const contract of contracts) {
			const invoices = contract.generateInvoices(input.month, input.year, input.type);
			for (const invoice of invoices) {
				toPersist.push({ idContract: contract.idContract, date: invoice.date, amount: invoice.amount });
			}
		}
		// Substituicao atomica do periodo/regime (Unit of Work na implementacao de banco).
		await this.invoiceRepository.replacePeriod(input.month, input.year, input.type, toPersist);
		// Resumo do fechamento viaja no evento, nao na resposta HTTP.
		const total = toPersist.reduce((sum, invoice) => sum + invoice.amount, 0);
		await this.mediator.publish("InvoicesClosed", {
			month: input.month,
			year: input.year,
			type: input.type,
			invoices: toPersist.length,
			total
		});
		// A resposta e o proprio lote gerado e persistido nesta execucao (nao uma releitura do banco).
		const output: Output[] = toPersist.map((invoice) => ({ date: invoice.date, amount: invoice.amount }));
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
