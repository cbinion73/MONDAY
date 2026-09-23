import Foundation
import Testing
@testable import MONDAYCore

struct CommandCenterContractTests {
    @Test func currentVersionThreePlanProducesMatchingReadback() throws {
        let now = try #require(ISO8601DateFormatter().date(from: "2026-09-23T12:00:00-04:00"))
        let json = """
        {
          "schemaVersion": 3,
          "planID": "plan-2026-09-23-test",
          "date": "2026-09-23",
          "generatedAt": "2026-09-23T08:00:00-04:00",
          "validUntil": "2026-09-24T00:00:00-04:00",
          "timezone": "America/New_York",
          "sources": [],
          "coverage": {"status": "available", "sources": [], "unresolved": []},
          "primaryFocus": "Protect commitments",
          "schedule": [],
          "priorities": {"a": [], "b": [], "c": []},
          "notes": [],
          "compass": [],
          "publication": {"producer": "monday@personal", "contractVersion": 3, "state": "published"}
        }
        """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let plan = try decoder.decode(CommandCenterPlan.self, from: Data(json.utf8))
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try #require(TimeZone(identifier: "America/New_York"))

        #expect(plan.validation(now: now, calendar: calendar) == .current)
        let readback = try #require(plan.readback(consumer: "test", appVersion: "1", consumedAt: now))
        #expect(readback.planID == plan.planID)
        #expect(readback.planSchemaVersion == 3)
        #expect(readback.state == "displayed")
    }

    @Test func expiredPlanIsRejected() throws {
        let now = try #require(ISO8601DateFormatter().date(from: "2026-09-23T12:00:00-04:00"))
        let json = """
        {
          "schemaVersion": 3,
          "planID": "plan-2026-09-23-expired",
          "date": "2026-09-23",
          "generatedAt": "2026-09-23T07:00:00-04:00",
          "validUntil": "2026-09-23T08:00:00-04:00",
          "timezone": "America/New_York",
          "sources": [],
          "primaryFocus": "Old plan",
          "schedule": [],
          "priorities": {"a": [], "b": [], "c": []},
          "notes": [],
          "compass": []
        }
        """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let plan = try decoder.decode(CommandCenterPlan.self, from: Data(json.utf8))
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try #require(TimeZone(identifier: "America/New_York"))

        guard case .expired = plan.validation(now: now, calendar: calendar) else {
            Issue.record("Expected the stale plan to be rejected as expired")
            return
        }
    }

    @Test func legacyPlanCanRenderButCannotClaimVerifiedReadback() throws {
        let json = """
        {
          "date": "2026-09-23",
          "generatedAt": "2026-09-23T08:00:00-04:00",
          "timezone": "America/New_York",
          "sources": [],
          "primaryFocus": "Legacy",
          "schedule": [],
          "priorities": {"a": [], "b": [], "c": []},
          "notes": [],
          "compass": []
        }
        """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let plan = try decoder.decode(CommandCenterPlan.self, from: Data(json.utf8))

        #expect(plan.readback(consumer: "test", appVersion: "1") == nil)
    }
}
