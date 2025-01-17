const fetch = require('node-fetch');

require('dotenv').config();

async function createExternalTask(taskSource, taskType, taskEmails, payload) {
    const apiUrl = `https://src-marketing101.com/api/orders/create/?source=${taskSource}&source_type=${taskType}&max_leads=${taskEmails}`;
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'accept': 'application/json',
            'X-API-Key': process.env.API_KEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error('Failed to fetch data from external API');
    }

    return await response.json();
}

async function checkExternalOrder(taskId) {
    const apiUrl = `https://src-marketing101.com/api/orders/${taskId}`;
    console.log(process.env.API_KEY)
    const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
            'accept': 'application/json',
            'X-API-Key': process.env.API_KEY
        }
    });

    if (!response.ok) {
        throw new Error('Failed to check order from external API');
    }

    return await response.json();
}

/*
createExternalTask("janbraeutigam.official","FL",500, { key: 'value' }).then((data) => {
    console.log(data);
}).catch((error) => {
    console.error(error);
});
*/
checkExternalOrder(894).then((data) => {
    console.log(data);
}).catch((error) => {
    console.log(error);
});
