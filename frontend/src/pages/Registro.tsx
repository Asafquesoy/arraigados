import { Carta } from "./sections/Carta";
import { Detalles } from "./sections/Detalles";
import { FormularioRegistro } from "./sections/FormularioRegistro";
import { Hero } from "./sections/Hero";
import { Pago } from "./sections/Pago";

export function Registro() {
  function scrollToForm() {
    document.getElementById("registro-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div>
      <Hero onScrollToForm={scrollToForm} />
      <Detalles />
      <Pago />
      <Carta />
      <FormularioRegistro />
    </div>
  );
}
