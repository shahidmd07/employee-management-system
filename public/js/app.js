document.querySelectorAll('input[name="fromDate"]').forEach(input => {
    input.addEventListener('change', () => {
        const to = input.form.querySelector('input[name="toDate"]');

        if (to) {
            to.min = input.value;

            if (to.value && to.value < input.value) {
                to.value = '';
            }
        }
    });
});
