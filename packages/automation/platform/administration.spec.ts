import { test, expect } from "./fixtures";
import { ProjectsPage } from "../ui/pages/projects.page";
import { MembersPage } from "../ui/pages/members.page";
import { NavigationComponent } from "../ui/components/navigation.component";
import { uniqueName, uniqueId } from "../ui/utils/test-data.utils";
test.describe("Project administration", () => {
  let projects: ProjectsPage;
  let navigation: NavigationComponent;
  test.beforeEach(async ({ page }) => {
    projects = new ProjectsPage(page);
    navigation = new NavigationComponent(page);
    await projects.goto();
  });
  test("project edits and active selection survive reload", async ({
    page,
  }) => {
    const name = uniqueName("Payments");
    await projects.create(name, "Payment contract verification");
    await expect(projects.heading(name)).toBeVisible();
    await projects.edit(name);
    await projects.updateDescription(
      "Payment and refund contract verification",
    );
    await expect(projects.card(name)).toContainText(
      "Payment and refund contract verification",
    );
    await navigation.selectProject(name);
    await expect(page).toHaveURL(/\/$/);
    await page.reload();
    await expect(navigation.selectedProject).toHaveText(name);
  });
});
test.describe("Member administration", () => {
  let members: MembersPage;
  test.beforeEach(async ({ page, isolatedProject }) => {
    void isolatedProject;
    members = new MembersPage(page);
    await members.goto();
  });
  test("administrator grants project access and changes member role", async ({
    isolatedProject,
  }) => {
    const subject = uniqueId("reviewer");
    const name = uniqueName("Reviewer");
    await members.add(subject, name, isolatedProject.name);
    await expect(members.subject(subject)).toBeVisible();
    await members.setRole(name, "operator");
    await expect(members.role(subject, "operator")).toBeVisible();
  });
});
