// Backend/test_api_endpoints.js
const http = require('http');

function request(options, data) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, res => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(body) });
                } catch {
                    resolve({ status: res.statusCode, data: body });
                }
            });
        });
        req.on('error', reject);
        if (data) req.write(JSON.stringify(data));
        req.end();
    });
}

async function runTests() {
    console.log('--- Testing Live Backend Endpoints on http://localhost:3000 ---');

    // 1. Admission Batches
    try {
        const res = await request({
            hostname: 'localhost',
            port: 3000,
            path: '/api/admission-batches',
            method: 'GET'
        });
        console.log(`✓ GET /api/admission-batches: Status ${res.status}, Batches: ${Array.isArray(res.data) ? res.data.length : 'N/A'}`);
    } catch(e) {
        console.error('❌ /api/admission-batches error:', e.message);
    }

    // 2. Student Dashboard by student_id_code
    try {
        const res = await request({
            hostname: 'localhost',
            port: 3000,
            path: '/api/student-dashboard/BB26-260001',
            method: 'GET'
        });
        console.log(`✓ GET /api/student-dashboard/BB26-260001: Status ${res.status}, Student: ${res.data?.student?.name} (${res.data?.student?.student_id_code})`);
    } catch(e) {
        console.error('❌ /api/student-dashboard error:', e.message);
    }

    // 3. Student Academic History
    try {
        const res = await request({
            hostname: 'localhost',
            port: 3000,
            path: '/api/students/1/academic-history',
            method: 'GET'
        });
        console.log(`✓ GET /api/students/1/academic-history: Status ${res.status}, Student: ${res.data?.student?.name}`);
    } catch(e) {
        console.error('❌ /api/students/1/academic-history error:', e.message);
    }

    // 4. Student Library
    try {
        const res = await request({
            hostname: 'localhost',
            port: 3000,
            path: '/api/books/student-library',
            method: 'GET'
        });
        console.log(`✓ GET /api/books/student-library: Status ${res.status}, Books count: ${Array.isArray(res.data) ? res.data.length : 'N/A'}`);
    } catch(e) {
        console.error('❌ /api/books/student-library error:', e.message);
    }

    console.log('--- Endpoint Tests Finished ---');
}

runTests();
