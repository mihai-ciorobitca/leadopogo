async function createExternalTask(taskSource, taskType, taskEmails) {
    const apiUrl = 'https://src-marketing101.com/api/orders/create/';
    const payload = {
        source: taskSource,
        source_type: taskType,
        max_leads: taskEmails
    };
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'accept': 'accept: application/json',
            'X-API-Key': process.env.API_KEY
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error('Failed to fetch data from external API');
    }

    return await response.json();
}

createExternalTask("boom","HT",2000).then((data) => {
    console.log(data);
}).catch((error) => {
    console.error(error);
});