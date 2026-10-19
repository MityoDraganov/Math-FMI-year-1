# Пример 2 (лекция 02): $\mathrm{Dom}$ и $\mathrm{Ran}$ на $A \times B$

**Условие.** $R = A \times B$ (възможно най-голямата релация над $A$ и $B$).

**Какво се иска (с думи).** Релация над $A$ и $B$ е множество от наредени двойки $(a, b)$ с $a \in A$, $b \in B$; $A \times B$ съдържа всички такива двойки, затова е най-голямата. $\mathrm{Dom}(R)$ (домейн) са първите елементи на двойките в $R$, а $\mathrm{Ran}(R)$ (рейндж) са вторите. Трябва да се намерят $\mathrm{Dom}(R)$ и $\mathrm{Ran}(R)$, като се внимава и за случая, когато някое от множествата е празното $\emptyset$. Например при $A = \{1, 2\}$, $B = \{5\}$ имаме $R = \{(1, 5), (2, 5)\}$.

*Решение.*

$$\mathrm{Dom}(R) = A \text{ при } B \ne \emptyset, \qquad \mathrm{Ran}(R) = B \text{ при } A \ne \emptyset,$$
защото $A \times \emptyset = \emptyset$ и $\emptyset \times B = \emptyset$. В този случай $R = \emptyset$ и
$$\mathrm{Dom}(\emptyset) = \mathrm{Ran}(\emptyset) = \emptyset.$$

Към лекция: [[02-Индукция-и-релации]]
