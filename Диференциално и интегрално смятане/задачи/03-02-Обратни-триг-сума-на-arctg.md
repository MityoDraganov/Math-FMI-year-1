# Задача 2 (обратни тригонометрични функции)

**Условие.** Да се докаже, че $\operatorname{arctg} x + \operatorname{arctg} y = \operatorname{arctg}\dfrac{x + y}{1 - xy}$ за $xy < 1$.

**Какво се иска (с думи).** $\operatorname{arctg} x$ е ъгълът между $-\frac{\pi}{2}$ и $\frac{\pi}{2}$, чийто тангенс е $x$. Трябва да покажем, че за всеки две реални числа $x$ и $y$, за които произведението $xy$ е по-малко от $1$, сборът на ъглите $\operatorname{arctg} x$ и $\operatorname{arctg} y$ е равен на ъгъла с тангенс $\frac{x+y}{1-xy}$. Например при $x = 1$, $y = 0$: $\operatorname{arctg} 1 + \operatorname{arctg} 0 = \frac{\pi}{4}$ и $\operatorname{arctg}\frac{1}{1} = \frac{\pi}{4}$.

*Решение.* $-\pi < \operatorname{arctg} x + \operatorname{arctg} y < \pi$ и
$$\cos(\operatorname{arctg} x + \operatorname{arctg} y) = \cos(\operatorname{arctg} x)\cos(\operatorname{arctg} y) - \sin(\operatorname{arctg} x)\sin(\operatorname{arctg} y)$$
$$= \frac{1}{\sqrt{1 + x^2}} \cdot \frac{1}{\sqrt{1 + y^2}} - \frac{x}{\sqrt{1 + x^2}} \cdot \frac{y}{\sqrt{1 + y^2}} = \frac{1 - xy}{\sqrt{1 + x^2}\sqrt{1 + y^2}} > 0,$$
защото $xy < 1$. Ъглите от $(-\pi, \pi)$ с положителен косинус са точно тези от $\left(-\frac{\pi}{2}, \frac{\pi}{2}\right)$, следователно
$$\alpha = \operatorname{arctg} x + \operatorname{arctg} y \in \left(-\frac{\pi}{2}, \frac{\pi}{2}\right), \qquad \beta = \operatorname{arctg}\frac{x + y}{1 - xy} \in \left(-\frac{\pi}{2}, \frac{\pi}{2}\right).$$
Освен това
$$\operatorname{tg}\alpha = \frac{\operatorname{tg}(\operatorname{arctg} x) + \operatorname{tg}(\operatorname{arctg} y)}{1 - \operatorname{tg}(\operatorname{arctg} x)\operatorname{tg}(\operatorname{arctg} y)} = \frac{x + y}{1 - xy} = \operatorname{tg}\beta.$$
Тъй като $\operatorname{tg}$ е строго растяща в $\left(-\frac{\pi}{2}, \frac{\pi}{2}\right)$, то $\alpha = \beta$. $\square$

Към лекция: [[03-Обратни-тригонометрични-функции]]
