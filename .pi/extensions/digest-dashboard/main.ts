// Vite browser entry. Mounts the Digest dashboard into #app.
import "./tailwind.css";
import { mount } from "svelte";
import Digest from "./Digest.svelte";

const target = document.getElementById("app");
if (target) {
  mount(Digest, { target });
}
