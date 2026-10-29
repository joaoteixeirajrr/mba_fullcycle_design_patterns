import PresenterFactory from "../src/infra/presenter/PresenterFactory";
import JsonPresenter from "../src/infra/presenter/JsonPresenter";
import CsvPresenter from "../src/infra/presenter/CsvPresenter";
// unit - Dynamic Factory de presenters
let factory: PresenterFactory;

beforeEach(() => {
	factory = new PresenterFactory();
});

test("Deve devolver o JsonPresenter para o formato json", function () {
	expect(factory.create("json")).toBeInstanceOf(JsonPresenter);
});

test("Deve devolver o JsonPresenter quando o formato e ausente (default)", function () {
	expect(factory.create()).toBeInstanceOf(JsonPresenter);
	expect(factory.create(undefined)).toBeInstanceOf(JsonPresenter);
});

test("Deve devolver o CsvPresenter para o formato csv", function () {
	expect(factory.create("csv")).toBeInstanceOf(CsvPresenter);
});

test("Deve lancar Invalid format para um formato desconhecido", function () {
	expect(() => factory.create("xml")).toThrow("Invalid format");
});
