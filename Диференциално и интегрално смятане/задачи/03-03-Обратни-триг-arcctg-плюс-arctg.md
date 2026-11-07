# Задача 3 (обратни тригонометрични функции)

**Условие.** Да се докаже, че за $x \in \mathbb{R}$
$$\operatorname{arcctg} x + \operatorname{arctg} x = \frac{\pi}{2}.$$

**Какво се иска (с думи).** $\operatorname{arctg} x$ е ъгълът между $-\frac{\pi}{2}$ и $\frac{\pi}{2}$, чийто тангенс е $x$, а $\operatorname{arcctg} x$ е ъгълът между $0$ и $\pi$, чийто котангенс е $x$. Трябва да покажем, че за всяко реално число $x$ сборът на тези два ъгъла е точно $\frac{\pi}{2}$ (т.е. $90^\circ$). Например при $x = 1$: $\operatorname{arctg} 1 = \frac{\pi}{4}$ и $\operatorname{arcctg} 1 = \frac{\pi}{4}$, а сборът е $\frac{\pi}{2}$.

*Решение.* Нека $\alpha = \operatorname{arctg} x$. Тогава $\alpha \in \left(-\frac{\pi}{2}, \frac{\pi}{2}\right)$ и $\operatorname{tg}\alpha = x$. Ъгълът $\frac{\pi}{2} - \alpha$ принадлежи на $(0, \pi)$ и
$$\operatorname{ctg}\left(\frac{\pi}{2} - \alpha\right) = \frac{\cos\left(\frac{\pi}{2} - \alpha\right)}{\sin\left(\frac{\pi}{2} - \alpha\right)} = \frac{\sin\alpha}{\cos\alpha} = \operatorname{tg}\alpha = x.$$
Следователно по дефиницията на $\operatorname{arcctg}$ (единственият ъгъл в $(0, \pi)$ с котангенс $x$)
$$\operatorname{arcctg} x = \frac{\pi}{2} - \alpha.$$
Затова
$$\operatorname{arcctg} x + \operatorname{arctg} x = \frac{\pi}{2} - \alpha + \alpha = \frac{\pi}{2}. \qquad \square$$

Към лекция: [[03-Обратни-тригонометрични-функции]]
