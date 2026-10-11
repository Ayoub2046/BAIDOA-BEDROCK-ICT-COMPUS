// Backend/test_exam_system_api.js
// Automated API verification for the upgraded Exam Management & Results system
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const http = require('http');
const app = require('./server.js');

let server;
const PORT = 3456;

function request(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const req = http.request({
            hostname: '127.0.0.1',
            port: PORT,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let json = null;
                try { json = JSON.parse(data); } catch(e) { json = data; }
                resolve({ status: res.statusCode, body: json });
            });
        });

        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

async function runTests() {
    console.log('=== Starting Exam System API Verification ===\n');
    server = app.listen(PORT);

    try {
        // Test 1: GET /api/exams
        console.log('Test 1: GET /api/exams');
        const res1 = await request('GET', '/api/exams');
        console.log(`Status: ${res1.status}, Count: ${Array.isArray(res1.body) ? res1.body.length : 0}`);
        if (res1.status !== 200 || !Array.isArray(res1.body)) throw new Error('Test 1 Failed');
        console.log('✓ Passed\n');

        // Test 2: Validation rejection when components sum != 100
        console.log('Test 2: Validation rejection when component marks do not sum to 100');
        const res2 = await request('POST', '/api/exams', {
            name: 'Invalid Exam Test',
            academicYear: '2026',
            month: 9,
            components: [
                { name: 'Part 1', max_marks: 30 },
                { name: 'Part 2', max_marks: 30 },
                { name: 'Part 3', max_marks: 30 } // sum = 90
            ]
        });
        console.log(`Status: ${res2.status}, Error Message: ${res2.body.error}`);
        if (res2.status !== 400 || !res2.body.error.includes('must equal 100')) throw new Error('Test 2 Failed');
        console.log('✓ Passed (Correctly rejected invalid sum)\n');

        // Test 3: Create September Monthly Exam with 3 components (30, 30, 40)
        console.log('Test 3: Create September Monthly Exam (3 Components: 30 / 30 / 40)');
        const res3 = await request('POST', '/api/exams', {
            name: 'September Monthly Exam 2026',
            academicYear: '2026',
            month: 9,
            examType: 'monthly',
            totalMarks: 100,
            components: [
                { name: 'Assessment 1', max_marks: 30 },
                { name: 'Assessment 2', max_marks: 30 },
                { name: 'Final Exam', max_marks: 40 }
            ],
            classIds: [1, 2],
            createdBy: 'Admin Test'
        });
        console.log(`Status: ${res3.status}, Exam ID: ${res3.body.id}, Components: ${res3.body.components?.length}`);
        if (res3.status !== 201 || !res3.body.id || res3.body.components.length !== 3) throw new Error('Test 3 Failed');
        const sepExamId = res3.body.id;
        console.log('✓ Passed\n');

        // Test 4: Create October Monthly Exam with 4 components (20, 20, 20, 40)
        console.log('Test 4: Create October Monthly Exam (4 Components: 20 / 20 / 20 / 40)');
        const res4 = await request('POST', '/api/exams', {
            name: 'October Monthly Exam 2026',
            academicYear: '2026',
            month: 10,
            examType: 'monthly',
            totalMarks: 100,
            components: [
                { name: 'Assignment 1', max_marks: 20 },
                { name: 'Assignment 2', max_marks: 20 },
                { name: 'Practical Work', max_marks: 20 },
                { name: 'Monthly Final', max_marks: 40 }
            ],
            classIds: [1, 2],
            createdBy: 'Admin Test'
        });
        console.log(`Status: ${res4.status}, Exam ID: ${res4.body.id}, Components: ${res4.body.components?.length}`);
        if (res4.status !== 201 || !res4.body.id || res4.body.components.length !== 4) throw new Error('Test 4 Failed');
        const octExamId = res4.body.id;
        console.log('✓ Passed\n');

        // Test 5: Submit September Marks for Student 1
        console.log('Test 5: Submit September Marks for Student 1');
        const res5 = await request('POST', '/api/results/batch', {
            periodId: sepExamId,
            teacherId: 1,
            teacherName: 'Teacher Test',
            records: [
                { studentId: 1, subject: 'Mathematics', examType: 'comp_1', score: 28, remarks: 'Excellent' },
                { studentId: 1, subject: 'Mathematics', examType: 'comp_2', score: 27, remarks: 'Good' },
                { studentId: 1, subject: 'Mathematics', examType: 'comp_3', score: 38, remarks: 'Great' }
            ]
        });
        console.log(`Status: ${res5.status}, Message: ${res5.body.message}`);
        if (res5.status !== 201) throw new Error('Test 5 Failed: ' + JSON.stringify(res5.body));
        console.log('✓ Passed\n');

        // Test 6: Submit October Marks for Student 1 (DIFFERENT marks)
        console.log('Test 6: Submit October Marks for Student 1');
        const res6 = await request('POST', '/api/results/batch', {
            periodId: octExamId,
            teacherId: 1,
            teacherName: 'Teacher Test',
            records: [
                { studentId: 1, subject: 'Mathematics', examType: 'comp_1', score: 18, remarks: 'Done' },
                { studentId: 1, subject: 'Mathematics', examType: 'comp_2', score: 19, remarks: 'Done' },
                { studentId: 1, subject: 'Mathematics', examType: 'comp_3', score: 17, remarks: 'Done' },
                { studentId: 1, subject: 'Mathematics', examType: 'comp_4', score: 35, remarks: 'Done' }
            ]
        });
        console.log(`Status: ${res6.status}, Message: ${res6.body.message}`);
        if (res6.status !== 201) throw new Error('Test 6 Failed: ' + JSON.stringify(res6.body));
        console.log('✓ Passed\n');

        // Test 7: Verify Zero Cross-Contamination
        console.log('Test 7: Verify Zero Cross-Contamination between September & October');
        const sepRes = await request('GET', `/api/results/class/1/subject/Mathematics?periodId=${sepExamId}`);
        const octRes = await request('GET', `/api/results/class/1/subject/Mathematics?periodId=${octExamId}`);

        const sepScores = sepRes.body.map(r => parseFloat(r.score));
        const octScores = octRes.body.map(r => parseFloat(r.score));

        console.log('September Marks for Student 1:', sepScores); // Expect [28, 27, 38] -> sum 93
        console.log('October Marks for Student 1:', octScores);   // Expect [18, 19, 17, 35] -> sum 89

        if (sepScores.length !== 3 || sepScores[0] !== 28 || sepScores[2] !== 38) throw new Error('September marks mismatch');
        if (octScores.length !== 4 || octScores[0] !== 18 || octScores[3] !== 35) throw new Error('October marks mismatch');
        console.log('✓ Passed (September & October marks remain 100% separate!)\n');

        // Test 8: Lock September Exam
        console.log('Test 8: Lock September Exam and verify submissions blocked');
        const lockRes = await request('PUT', `/api/exams/${sepExamId}/status`, {
            status: 'locked',
            changedBy: 'Admin Test',
            reason: 'End of September assessment cycle'
        });
        console.log(`Lock Status: ${lockRes.status}, Current status: ${lockRes.body.status}`);
        if (lockRes.status !== 200 || lockRes.body.status !== 'locked') throw new Error('Lock failed');

        // Attempt submission to locked exam -> must fail
        const blockedRes = await request('POST', '/api/results/batch', {
            periodId: sepExamId,
            teacherId: 1,
            teacherName: 'Teacher Test',
            records: [{ studentId: 1, subject: 'Mathematics', examType: 'comp_1', score: 30 }]
        });
        console.log(`Submission to locked exam blocked with status: ${blockedRes.status}`);
        if (blockedRes.status !== 403) throw new Error('Locked exam should have blocked submission');
        console.log('✓ Passed (Locking verified tamper-proof)\n');

        // Test 9: Reopen September Exam with Audit Logging
        console.log('Test 9: Reopen September Exam with Audit Logging');
        const reopenRes = await request('PUT', `/api/exams/${sepExamId}/reopen`, {
            changedBy: 'Principal Test',
            reason: 'Authorized correction for class 1 mathematics'
        });
        console.log(`Reopen Status: ${reopenRes.status}, Status: ${reopenRes.body.status}`);
        if (reopenRes.status !== 200 || reopenRes.body.status !== 'open') throw new Error('Reopen failed');

        const auditRes = await request('GET', `/api/exams/${sepExamId}/audit-logs`);
        console.log(`Audit log records count: ${auditRes.body.length}`);
        const lastLog = auditRes.body[0];
        console.log(`Latest audit log: [${lastLog.action}] by ${lastLog.changed_by} - Reason: "${lastLog.reason}"`);
        if (!lastLog || lastLog.action !== 'REOPEN') throw new Error('Audit log verification failed');
        console.log('✓ Passed\n');

        // Test 10: Test Aggregate Cumulative Calculation
        console.log('Test 10: Aggregate Cumulative Calculation across September (40%) and October (60%)');
        // First approve both results so they count as official
        const allResIds = [...sepRes.body.map(r => r.id), ...octRes.body.map(r => r.id)];
        await request('PUT', '/api/results/approve', { ids: allResIds, status: 'approved' });

        const aggRes = await request('POST', '/api/exams/aggregate/calculate', {
            name: 'Term 1 Cumulative Result',
            academicYear: '2026',
            classId: 1,
            calculationMethod: 'weighted',
            weights: {
                [sepExamId]: 40,
                [octExamId]: 60
            }
        });
        console.log(`Aggregate Status: ${aggRes.status}, Config ID: ${aggRes.body.configId}`);
        const std1 = aggRes.body.results.find(s => s.studentId === 1);
        console.log(`Student 1 Aggregate Mathematics: ${std1?.subjects?.Mathematics}%, Overall: ${std1?.overallPercentage}%, Grade: ${std1?.grade}`);
        // September: 93% * 0.40 = 37.2. October: 89% * 0.60 = 53.4. Sum = 90.6 -> Grade A+
        if (Math.abs(std1?.subjects?.Mathematics - 90.6) > 0.5) throw new Error('Aggregate math calculation incorrect');
        console.log('✓ Passed (Aggregate math verified 100% accurate)\n');

        console.log('========================================================');
        console.log('🎉 ALL 10 EXAM SYSTEM BACKEND TESTS PASSED SUCCESSFULLY!');
        console.log('========================================================\n');

    } catch (e) {
        console.error('❌ Test failed with error:', e);
        process.exitCode = 1;
    } finally {
        if (server) server.close();
        process.exit(process.exitCode || 0);
    }
}

runTests();
