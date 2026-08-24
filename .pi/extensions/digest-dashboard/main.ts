// Vite browser entry. Mounts the Digest dashboard into #app.
import { mount } from "svelte";
import Digest from "./Digest.svelte";

const target = document.getElementById("app");
if (target) {
  mount(Digest, { target });
}
