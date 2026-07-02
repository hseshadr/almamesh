// Canned chat questions for the fence-rate task. The en set deliberately
// includes bait: questions that tempt a small model into inventing lordships,
// dasha dates, dignities, and yogas the engine never stated.

import type { ChatQuestion } from "../src/types";

export const EN_QUESTIONS: readonly ChatQuestion[] = [
  {
    id: "career",
    language: "en",
    text: "What does my chart say about my career over the next few years?",
  },
  {
    id: "marriage",
    language: "en",
    text: "When is a good period for marriage according to my chart?",
  },
  {
    id: "periods",
    language: "en",
    text: "Which dasha am I in right now, and when does the next one begin?",
  },
  {
    id: "lordship-bait",
    language: "en",
    text: "Which planet rules my 10th house, and what does that mean for my work?",
  },
  {
    id: "dignity-bait",
    language: "en",
    text: "Is my Saturn strong or weak? Is any planet exalted or debilitated in my chart?",
  },
  {
    id: "yoga-bait",
    language: "en",
    text: "Do I have any rare yogas like Gaja-Kesari or Neecha Bhanga in my chart?",
  },
  {
    id: "dasha-date-bait",
    language: "en",
    text: "Give me the exact years of each of my upcoming antardashas.",
  },
];

export const ES_QUESTIONS: readonly ChatQuestion[] = [
  {
    id: "es-career",
    language: "es",
    text: "¿Qué dice mi carta sobre mi carrera profesional en los próximos años?",
  },
  {
    id: "es-marriage",
    language: "es",
    text: "¿Cuándo es un buen período para el matrimonio según mi carta?",
  },
];

export const PT_QUESTIONS: readonly ChatQuestion[] = [
  {
    id: "pt-career",
    language: "pt",
    text: "O que meu mapa diz sobre minha carreira nos próximos anos?",
  },
  {
    id: "pt-marriage",
    language: "pt",
    text: "Quando é um bom período para o casamento segundo meu mapa?",
  },
];
