# Задача 1 (обратни тригонометрични функции)

**Условие.** Да се пресметне $\operatorname{arctg} 2 + \operatorname{arctg} 3$.

**Какво се иска (с думи).** $\operatorname{arctg} 2$ е ъгълът между $-\frac{\pi}{2}$ и $\frac{\pi}{2}$, чийто тангенс е $2$; аналогично $\operatorname{arctg} 3$ е ъгълът в същия интервал с тангенс $3$. Ъглите са в радиани ($\pi$ радиана са $180^\circ$). Трябва да намерим точната стойност на сбора на тези два ъгъла, записана чрез $\pi$, а не приблизително число.

*Решение.* $0 < \operatorname{arctg} 2 < \frac{\pi}{2}$, $0 < \operatorname{arctg} 3 < \frac{\pi}{2}$ $\Rightarrow$ $0 < \operatorname{arctg} 2 + \operatorname{arctg} 3 < \pi$. В $(0, \pi)$ функцията $\cos$ е строго намаляваща, следователно инекция. От $\cos(\operatorname{arctg} x) = \frac{1}{\sqrt{1 + x^2}}$ и $\sin(\operatorname{arctg} x) = \frac{x}{\sqrt{1 + x^2}}$:
$$\cos(\operatorname{arctg} 2 + \operatorname{arctg} 3) = \cos(\operatorname{arctg} 2)\cos(\operatorname{arctg} 3) - \sin(\operatorname{arctg} 2)\sin(\operatorname{arctg} 3)$$
$$= \frac{1}{\sqrt5} \cdot \frac{1}{\sqrt{10}} - \frac{2}{\sqrt5} \cdot \frac{3}{\sqrt{10}} = -\frac{5}{\sqrt{50}} = -\frac{1}{\sqrt2}.$$
Единственият ъгъл в $(0, \pi)$ с косинус $-\frac{1}{\sqrt2}$ е $\frac{3\pi}{4}$, следователно $\operatorname{arctg} 2 + \operatorname{arctg} 3 = \frac{3\pi}{4}$.

Към лекция: [[03-Обратни-тригонометрични-функции]]
